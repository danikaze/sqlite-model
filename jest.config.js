const { pathsToModuleNameMapper } = require("ts-jest");
const { compilerOptions } = require("./tsconfig.json");

module.exports = {
  setupFilesAfterEnv: [
    "@alex_neo/jest-expect-message",
    "<rootDir>/jest/mocks.ts",
  ],

  testMatch: ["**/*.(test|spec).ts"],
  testEnvironment: "jsdom",
  collectCoverage: true,
  coverageDirectory: "<rootDir>/coverage",
  coverageReporters: ["json", "lcov", "text", "text-summary"],
  collectCoverageFrom: ["<rootDir>/**/*.{ts,tsx}", "!**/*.d.ts"],
  coveragePathIgnorePatterns: ["/node_modules/"],
  moduleNameMapper: {
    ...pathsToModuleNameMapper(compilerOptions.paths || {}, {
      prefix: "<rootDir>/",
    }),
  },

  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
        babelConfig: true,
        tsconfig: "tsconfig.json",
      },
    ],
  },
  transformIgnorePatterns: ["/node_modules/"],
};
