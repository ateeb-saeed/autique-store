// Import the Autique catalogue (lib/catalog.js) into data/ from the command line.
// Usage: npm run import-catalog            (shows what would change)
//        npm run import-catalog -- --apply (makes the changes)
const store = require('../lib/store');
const { catalogPlan, applyCatalog } = require('../lib/catalogImport');

store.seed();
const { rows, untouched } = catalogPlan(store.getProducts());
for (const r of rows) {
  const action = r.target ? (r.target.name === r.cp.name ? 'update' : `update "${r.target.name}" ->`) : 'add';
  console.log(`${action.padEnd(38)} ${r.cp.name}${r.merged.length ? `  (merges ${r.merged.map(m => m.name).join(', ')})` : ''}`);
}
if (untouched.length) console.log(`\nLeft as they are: ${untouched.map(p => p.name).join(', ')}`);
if (process.argv.includes('--apply')) {
  console.log('\nImported:', applyCatalog());
} else {
  console.log('\nNothing changed. Run again with --apply to import.');
}
