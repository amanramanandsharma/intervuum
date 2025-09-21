# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

Intervuum is an Angular 20 application built with modern Angular features including standalone components, signals, and zoneless change detection. The project uses Angular CLI for development tooling and Karma/Jasmine for testing.

## Technology Stack

- **Framework**: Angular 20.3.0
- **Language**: TypeScript 5.9.2
- **Styling**: SCSS
- **Testing**: Karma + Jasmine
- **Build Tool**: Angular CLI with esbuild
- **Node Version**: Requires Node.js >=20.19.0 || ^22.12.0 || >=24.0.0

## Architecture

### Application Structure
- **Standalone Application**: Uses the new Angular standalone component architecture without NgModules
- **Signals**: Uses Angular signals for reactive state management (`signal()` API)
- **Zoneless Change Detection**: Configured with `provideZonelessChangeDetection()`
- **Component-based Architecture**: Single root component (`App`) with potential for expansion

### Key Files
- `src/main.ts`: Application bootstrap using `bootstrapApplication()`
- `src/app/app.ts`: Root standalone component
- `src/app/app.config.ts`: Application configuration with providers
- `src/app/app.html`: Root template with Angular 20 template syntax
- `src/app/app.scss`: Component styles

### Configuration
- TypeScript: Strict mode enabled with modern ES2022 target
- Angular Compiler: Strict templates and injection parameters
- Build: Application builder with SCSS support

## Common Development Commands

### Development Server
```bash
ng serve
# or
npm start
```
Starts development server on http://localhost:4200 with hot reload

### Build
```bash
ng build                    # Production build
ng build --watch           # Development build with file watching
```

### Testing
```bash
ng test                     # Run unit tests with Karma
ng test --watch            # Run tests in watch mode
ng test --code-coverage    # Run tests with coverage report
```

### Code Generation
```bash
ng generate component <name>    # Generate new component
ng generate service <name>      # Generate new service
ng generate --help              # See all available schematics
```

### Linting & Formatting
The project includes Prettier configuration:
- Print width: 100 characters
- Single quotes enabled
- Angular HTML parser for templates

## Development Guidelines

### Component Development
- Use standalone components (`imports: []` instead of NgModules)
- Prefer signals over traditional reactive patterns
- Use Angular's new control flow syntax (`@if`, `@for`)
- Follow the established SCSS component styling pattern

### TypeScript Standards
- Strict mode is enforced
- Use ES2022+ features
- Enable all strict TypeScript compiler options
- Use proper type annotations

### Testing
- Unit tests should be placed alongside components with `.spec.ts` extension
- Use Karma + Jasmine testing framework
- Test files use `tsconfig.spec.json` configuration

### Styling
- Use SCSS for component styles
- Component styles are scoped (styleUrl property)
- Global styles in `src/styles.scss`
- Follow existing color scheme and design patterns

## Important Notes

- This is a modern Angular 20 application using standalone components and signals
- No NgModules are used - everything is standalone
- Uses zoneless change detection for better performance
- Built with the latest Angular CLI and build tools
- Compatible with Angular's modern development practices

## Project Structure Context
```
src/
├── app/
│   ├── app.ts           # Root standalone component
│   ├── app.html         # Root template
│   ├── app.scss         # Root styles
│   ├── app.config.ts    # App configuration
│   └── app.spec.ts      # Root component tests
├── main.ts              # Bootstrap entry point
├── index.html           # HTML shell
└── styles.scss          # Global styles
```