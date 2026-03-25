import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

const eslintConfig = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      "no-restricted-syntax": [
        "warn",
        {
          selector: "MemberExpression[property.name='url'][object.property.name='featuredAsset']",
          message: "Prefer resolveAssetDisplay()/resolveEntityPrimaryImage() over direct featuredAsset.url reads.",
        },
      ],
    },
  },
];

export default eslintConfig;
