const lucide = require('lucide-react');

const icons = [
  'Menu', 'X', 'Calendar', 'MapPin', 'Mail', 'Award', 'Check', 'ChevronRight', 'Send', 'ArrowUp',
  'Linkedin', 'Facebook', 'Instagram', 'ShieldAlert', 'Globe'
];

console.log('Verifying Lucide Icons exports:');
const missing = [];
icons.forEach(name => {
  if (lucide[name]) {
    console.log(`[OK] ${name} is exported.`);
  } else {
    console.log(`[MISSING] ${name} is NOT exported!`);
    missing.push(name);
  }
});

if (missing.length > 0) {
  console.log('\nError: Missing icons found!', missing);
} else {
  console.log('\nSuccess: All icons verified!');
}
