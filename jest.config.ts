import type { Config } from 'jest';
const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  setupFiles: ['dotenv/config'],
  moduleFileExtensions: ['ts','js','json'],
  testMatch: ['**/*.spec.ts']
};
export default config;


