/**
 * Enforces the layer rules in CLAUDE.md:
 *  - src/core imports only src/core and no UI/native packages.
 *  - src/modules/<name> imports core, its own files, and other modules only via their index.
 *  - Only src/app may import src/app.
 */
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');
const PLATFORM_PACKAGES = [
  /^react$/,
  /^react\//,
  /^react-native($|\/|-)/,
  /^expo($|\/|-)/,
  /^@expo\//,
  /^@op-engineering\//,
  /^@react-navigation\//,
];

function layerOf(file) {
  const rel = path.relative(SRC, file);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  const [top, name] = rel.split(path.sep);
  if (top === 'core') return { layer: 'core' };
  if (top === 'app') return { layer: 'app' };
  if (top === 'modules' && name) return { layer: 'module', name };
  return { layer: 'other' };
}

function resolveTarget(specifier, fromFile) {
  if (specifier.startsWith('@/')) return path.join(SRC, specifier.slice(2));
  if (specifier.startsWith('.')) return path.resolve(path.dirname(fromFile), specifier);
  return null;
}

module.exports = {
  meta: {
    type: 'problem',
    docs: { description: 'Enforce core/modules/app import boundaries' },
    messages: {
      corePlatform: 'src/core must not import UI or native SDK "{{specifier}}".',
      coreLayer: 'src/core may only import from src/core.',
      appLayer: 'Only src/app may import from src/app.',
      modulePublic: 'Import module "{{name}}" through its public index (@/modules/{{name}}), not its internals.',
    },
    schema: [],
  },
  create(context) {
    const filename = context.filename;
    const from = layerOf(filename);
    if (!from) return {};

    function check(node, specifier) {
      if (typeof specifier !== 'string') return;
      const target = resolveTarget(specifier, filename);
      if (target === null) {
        if (from.layer === 'core' && PLATFORM_PACKAGES.some((re) => re.test(specifier))) {
          context.report({ node, messageId: 'corePlatform', data: { specifier } });
        }
        return;
      }
      const to = layerOf(target);
      if (!to) return;
      if (from.layer === 'core') {
        if (to.layer !== 'core') context.report({ node, messageId: 'coreLayer' });
        return;
      }
      if (to.layer === 'app' && from.layer !== 'app') {
        context.report({ node, messageId: 'appLayer' });
        return;
      }
      if (to.layer === 'module' && !(from.layer === 'module' && from.name === to.name)) {
        const inner = path.relative(path.join(SRC, 'modules', to.name), target);
        if (inner !== '' && inner !== 'index') {
          context.report({ node, messageId: 'modulePublic', data: { name: to.name } });
        }
      }
    }

    const fromSource = (node) => node.source && check(node, node.source.value);
    return {
      ImportDeclaration: fromSource,
      ExportNamedDeclaration: fromSource,
      ExportAllDeclaration: fromSource,
      ImportExpression: (node) => node.source.type === 'Literal' && check(node, node.source.value),
    };
  },
};
