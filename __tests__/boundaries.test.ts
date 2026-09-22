import path from 'path';
import { RuleTester } from 'eslint';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const rule = require('../eslint/boundaries');

const SRC = path.join(__dirname, '..', 'src');
const at = (...parts: string[]) => path.join(SRC, ...parts);
const tester = new RuleTester({ languageOptions: { ecmaVersion: 2022, sourceType: 'module' } });

tester.run('hm/boundaries', rule, {
  valid: [
    { filename: at('core', 'a.ts'), code: "import { x } from './b';" },
    { filename: at('modules', 'survey', 'a.ts'), code: "import { x } from '@/core';" },
    { filename: at('modules', 'survey', 'a.ts'), code: "import { x } from '@/modules/storage';" },
    { filename: at('modules', 'survey', 'a.ts'), code: "import { x } from './internal/b';" },
    { filename: at('modules', 'survey', 'a.ts'), code: "import { View } from 'react-native';" },
    { filename: at('app', 'a.ts'), code: "import { x } from '../modules/storage/index';" },
  ],
  invalid: [
    { filename: at('core', 'a.ts'), code: "import { View } from 'react-native';", errors: [{ messageId: 'corePlatform' }] },
    { filename: at('core', 'a.ts'), code: "import x from 'expo-camera';", errors: [{ messageId: 'corePlatform' }] },
    { filename: at('core', 'a.ts'), code: "import { x } from '@/modules/storage';", errors: [{ messageId: 'coreLayer' }] },
    { filename: at('modules', 'survey', 'a.ts'), code: "import { x } from '@/modules/storage/sqlDriver';", errors: [{ messageId: 'modulePublic' }] },
    { filename: at('modules', 'survey', 'a.ts'), code: "export * from '../storage/migrations';", errors: [{ messageId: 'modulePublic' }] },
    { filename: at('modules', 'survey', 'a.ts'), code: "import { c } from '@/app/container';", errors: [{ messageId: 'appLayer' }] },
    { filename: at('app', 'a.ts'), code: "const m = import('@/modules/storage/opSqliteDriver');", errors: [{ messageId: 'modulePublic' }] },
  ],
});
