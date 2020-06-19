const puppeteer = require('puppeteer');

const b64DecodeUnicode = input => {
  // Going backwards: from bytestream, to percent-encoding, to original string.
  return decodeURIComponent(
    Buffer.from(input, 'base64')
      .toString('binary')
      .split('')
      .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
      .join('')
  );
}

const deobfuscate = payload => {
  if (payload.length % 9 > 0 || payload.match(/[^a-zA-Z0-9\/= +]/g)) {
    throw new Error('Payload invalid');
  }

  const byteString = payload
    .replace(/(.)(.)(.)(.)(.)(.)(.)(.)(.)/g, '$2$6$8$1$4$9$3$5$7')
    .replace(/ +$/, '');

  const deobfuscated = b64DecodeUnicode(byteString);
  return JSON.parse(deobfuscated);
}

const clearTags = str => str.replace(/<[^>]*>?/gm, '');
const respPattern = /\${response:([0-9a-f]{8}-[0-9a-f]{4}-[0-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12})}/g;
const questionTypes = {
  MATCHING: "Matching question",
  MULTIPLE_CHOICE: 'Multiple choice question',
  FILL_IN_THE_BLANK: 'Fill in the blank question',
  MULTIPLE_CHOICE_MULTI_SELECT: 'Multiple select question',
  TRUE_FALSE: "True or false question"
};

(async () => {
  const browser = await puppeteer.launch({ headless: false, defaultViewport: null });
  const page = await browser.newPage();
  await page.goto('https://newconnect.mheducation.com/flow/connect.html');

  page.on('response', response => {
    if (response.url().includes("assessment-items")) {
      response.json().then(data => {
        const questionType = data.type;
        const deobfuscated = deobfuscate(data.hidata.payload);

        if (questionType in questionTypes) {
          console.log('\x1b[33m%s\x1b[0m', `🤔 ${questionTypes[questionType]}`);
        } else {
          console.log('\x1b[33m%s\x1b[0m', `🤔 ${questionType}`);
        }
        console.log(`  ${clearTags(deobfuscated.prompt).replace(respPattern, '______')}`);
        console.log('\x1b[33m%s\x1b[0m', '✨ Answer');

        switch (questionType) {
          case "MATCHING":
            for (const answer of deobfuscated.answers) {
              const prompt = deobfuscated.prompts.find(e => e.key === answer.prompt);
              const choices = deobfuscated.choices.filter(e => answer.choices.includes(e.key));

              process.stdout.write(`  ${clearTags(prompt.content)} `);
              console.log('\x1b[33m%s\x1b[0m', '=>');
              for (const choice of choices) {
                console.log(`    - ${clearTags(choice.content)}`);
              }
            }
            break;
          case "MULTIPLE_CHOICE":
            if ('answer' in deobfuscated) {
              const answer = deobfuscated.choices.find(e => e.key === deobfuscated.answer);
              console.log(`  ${clearTags(answer.content)}`);
            }
            break;
          case "FILL_IN_THE_BLANK":
            const matches = Array.from(deobfuscated.prompt.matchAll(respPattern));
            if (matches && matches.length > 0) {
              let prompt = deobfuscated.prompt;
              for (const match of matches) {
                const answer = deobfuscated.answers.find(e => e.response === match[1]);
                prompt = prompt.replace(match[0], `(${answer.values.join("|")})`);
              }
              console.log(`  ${clearTags(prompt)}`);
            }
            break;
          case "MULTIPLE_CHOICE_MULTI_SELECT":
            for (answer of deobfuscated.answers) {
              const choice = deobfuscated.choices.find(e => e.key === answer);
              console.log(`  - ${clearTags(choice.content)}`);
            }
            break;
          case "TRUE_FALSE":
            if (deobfuscated.answer === 'true') {
              console.log(`  True`);
            } else {
                console.log(`  False`);
            }
            break;
          default:
            console.log(JSON.stringify(deobfuscated, null, 2));
        }
        console.log();
      }).catch(err => {
        if (!(err instanceof SyntaxError)) {
          console.error(err);
        }
      })
    }
  })
})();
