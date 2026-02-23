const fs = require('fs');
const results = JSON.parse(fs.readFileSync('lint-results.json', 'utf8'));

const targets = ['Lightbox', 'Navbar', 'SearchPage', 'hooks'];
const filtered = results.filter(r => {
    return targets.some(t => r.filePath.includes(t)) && r.errorCount + r.warningCount > 0;
});

filtered.forEach(file => {
    console.log(`\n=== ${file.filePath} ===`);
    file.messages.forEach(m => {
        console.log(`  Line ${m.line}:${m.column} - ${m.message} (${m.ruleId})`);
    });
});
