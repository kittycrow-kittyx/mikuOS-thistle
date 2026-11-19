import type ts from "typescript";
import type { Project } from "@kitty-crow/code-guards/src/project.ts";

function appBase(checker: ts.TypeChecker, type: ts.Type): ts.Type | null {
  const symbol = type.getSymbol() ?? null;
  const declarations = symbol === null ? [] : symbol.declarations ?? [];
  if (symbol !== null && symbol.getName() === "App" && declarations.some(declaration =>
    declaration.getSourceFile().fileName.replaceAll("\\", "/").endsWith("/thistle/src/apps/base.ts")
  )) return type;
  if (!type.isClassOrInterface()) return null;
  for (const base of checker.getBaseTypes(type)) {
    const app = appBase(checker, base);
    if (app) return app;
  }
  return null;
}

/** Exclude canonical App contract slots from structural reuse, not from implementation checks. */
export function ownedReuseProject(project: Project): Project {
  const checker = project.checker;
  const owned = new Set(project.files);
  const getPropertiesOfType: ts.TypeChecker["getPropertiesOfType"] = type => {
    const properties = checker.getPropertiesOfType(type);
    const symbol = type.getSymbol() ?? null;
    if (symbol === null) return properties;
    const declarations = symbol.declarations ?? [];
    if (!declarations.some(declaration => owned.has(declaration.getSourceFile()))) return properties;
    const app = appBase(checker, type);
    if (!app) return properties;
    const contract = new Set(checker.getPropertiesOfType(app).map(property => property.getName()));
    return properties.filter(property => !contract.has(property.getName()));
  };
  return { ...project, checker: { ...checker, getPropertiesOfType } };
}
