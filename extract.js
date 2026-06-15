const fs = require('fs');
const readline = require('readline');

async function processLineByLine() {
  const fileStream = fs.createReadStream('C:\\Users\\jabustos\\.gemini\\antigravity\\brain\\df246635-3b0e-4d3a-a4b4-7a7681f3cda0\\.system_generated\\logs\\transcript_full.jsonl');
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  for await (const line of rl) {
    const obj = JSON.parse(line);
    if (obj.type === 'VIEW_FILE' && obj.content && obj.content.includes('File Path: `file:///c:/Users/jabustos/Desktop/APP%20y%20N8N/App/app.js`') && obj.content.includes('Total Lines: 1122')) {
      let rawText = obj.content;
      const parts = rawText.split('\n');
      let cleaned = [];
      let inCode = false;
      for (let p of parts) {
        if (inCode) {
            cleaned.push(p.replace(/^\d+:\s?/, ''));
        }
        if (p.includes('<line_number>: <original_line>')) {
            inCode = true;
        }
      }
      fs.writeFileSync('original_app_js_clean.js', cleaned.join('\n'));
      console.log('Done!');
      break;
    }
  }
}
processLineByLine();
