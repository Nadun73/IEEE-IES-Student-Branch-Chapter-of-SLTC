const React = require('react');
const ReactDOMServer = require('react-dom/server');
const fs = require('fs');

// Mock browser globals that might be used at module level
global.window = {
  addEventListener: () => {},
  removeEventListener: () => {},
  innerWidth: 1024,
  innerHeight: 768,
  scrollY: 0
};
global.document = {
  querySelector: () => null,
  getElementById: () => null
};

// Mock the image import
require.extensions['.png'] = function (module, filename) {
  module.exports = '/assets/ies-logo.png';
};
require.extensions['.css'] = function (module, filename) {
  module.exports = {};
};

try {
  console.log('Registering babel-register to compile JSX dynamically...');
  require('@babel/register')({
    presets: ['@babel/preset-react'],
    extensions: ['.jsx', '.js']
  });
} catch (e) {
  console.log('Babel register not available, running custom JSX transform or direct require...');
}

try {
  console.log('Loading App component...');
  const App = require('./src/App.jsx').default;
  
  console.log('Rendering App component to static HTML string...');
  const html = ReactDOMServer.renderToString(React.createElement(App));
  console.log('App component rendered successfully! HTML length:', html.length);
  fs.writeFileSync('rendered_output.html', html);
} catch (err) {
  console.error('\n!!! RUNTIME RENDER EXCEPTION DETECTED !!!');
  console.error(err);
}
