import ts from "typescript";

function pushSpecifier(specifiers: Set<string>, value: string | undefined): void {
  if (value && value.length > 0) {
    specifiers.add(value);
  }
}

export function parseImportSpecifiers(filePath: string, sourceText: string): string[] {
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const specifiers = new Set<string>();

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      const moduleSpecifier = node.moduleSpecifier;
      if (moduleSpecifier && ts.isStringLiteral(moduleSpecifier)) {
        pushSpecifier(specifiers, moduleSpecifier.text);
      }
    }

    if (ts.isCallExpression(node)) {
      const [firstArgument] = node.arguments;
      const expression = node.expression;

      const isRequireCall = ts.isIdentifier(expression) && expression.text === "require";
      const isDynamicImport = expression.kind === ts.SyntaxKind.ImportKeyword;

      if ((isRequireCall || isDynamicImport) && firstArgument && ts.isStringLiteral(firstArgument)) {
        pushSpecifier(specifiers, firstArgument.text);
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return [...specifiers];
}
