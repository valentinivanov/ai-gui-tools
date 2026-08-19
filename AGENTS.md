# TypeScript & React Codex Project Guidelines

## Code Quality & Architecture
- **Avoid Code Duplication**: Search the codebase for existing UI components, custom hooks, or utility functions before writing new ones.
- **Extract Common Functionality**: Refactor shared stateful logic into custom hooks (`use...`) and reusable presentation components into isolated UI modules.
- **SOLID & Component Architecture**:
  - Keep components single-purpose (separate container/data-fetching components from presentational UI components).
  - Prefer composition over prop-drilling or overly complex single components.
- **Generic Programming**: Use TypeScript generics (`<T>`) for flexible, type-safe custom hooks, utility functions, and reusable UI wrappers.

## React & JSX Guidelines
- **Functional Components**: Write pure functional components using standard function declarations or arrow functions. Do NOT use `React.FC` or `React.FunctionComponent`.
- **Custom Hooks**: Encapsulate non-trivial state transitions, side effects, and async data fetching into named custom hooks placed in `/hooks`.
- **Server vs. Client Components (Next.js / React Server Components)**:
  - Default components to Server Components unless client-side interactivity (`useState`, `useEffect`, event listeners) is required.
  - Explicitly place `'use client';` or `'use server';` directives at the very top of files when applicable. Keep client components leaves in the component tree to optimize bundle size.
- **Memoization & Performance**:
  - Use `useMemo` and `useCallback` deliberately for expensive calculations or reference stability when passing callbacks to memoized children.
  - Keep state local whenever possible; avoid global state for purely UI-driven flags.
- **JSX Conventions**:
  - Avoid inline functions inside render loops or heavy lists where performance is sensitive.
  - Always provide stable, unique `key` props (never array indexes) when rendering lists.

## TypeScript & Type Safety Rules
- **Strict Typing**: Never use `any`. Use `unknown` when types are dynamic, accompanied by runtime type guards or Zod schema validation.
- **Explicit Component Props**: Define dedicated interfaces for component props (e.g., `interface ButtonProps`). Use `React.ReactNode` for `children`.
- **Interfaces vs. Types**: Use `interface` for component props and public API shapes. Use `type` for unions, intersections, and primitives.
- **Enums**: Avoid TypeScript `enum`. Prefer string literal unions or `const` objects with `as const`.

## Naming Conventions
- **React Components & Pages**: Use `PascalCase` for component files and directory names (e.g., `UserProfile.tsx`, `NavigationMenu/index.tsx`).
- **Hooks**: Use `camelCase` starting with `use` (e.g., `useAuth.ts`, `useWindowSize.ts`).
- **Utilities & Helpers**: Use `kebab-case` or `camelCase` (e.g., `format-date.ts`, `apiClient.ts`).
- **Types & Interfaces**: Use `PascalCase` (e.g., `UserProfileProps`, `NavigationState`). Do NOT prefix interfaces with `I`.

## Tooling & Quality Checks
- **Linting & Rules**: Adhere strictly to ESLint React Hooks rules (`react-hooks/rules-of-hooks`, `react-hooks/exhaustive-deps`).
- **Testing**: Write component and hook tests using React Testing Library and Vitest/Jest. Ensure `npm run build` passes without type or lint errors before completing tasks.