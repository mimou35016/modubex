import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

export type FakeUiViolation = {
  fileName: string;
  line: number;
  rule: string;
  message: string;
};

const ALLOW_MARKER = /\/\/\s*zero-fake-ui-allow:\s*\S/;
const FAKE_TEXT = /(coming\s*soon|planned|lorem\s*ipsum|mock|dummy|fake)/i;
const TODO_TEXT = /\b(?:TODO|FIXME)\b/;
const USER_FACING_ATTRIBUTES = new Set([
  "alt",
  "aria-description",
  "aria-label",
  "label",
  "placeholder",
  "title",
]);

type CheckContext = {
  sourceFile: ts.SourceFile;
  allowMarkers: readonly number[];
  violations: FakeUiViolation[];
};

function isStringLike(node: ts.Node): node is ts.StringLiteral | ts.NoSubstitutionTemplateLiteral {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node);
}

function staticString(value: ts.JsxAttributeValue | undefined): string | undefined {
  if (!value) return undefined;
  if (isStringLike(value)) return value.text;
  if (ts.isJsxExpression(value) && value.expression && isStringLike(value.expression)) {
    return value.expression.text;
  }
  return undefined;
}

function isNoopExpression(expression: ts.Expression | undefined): boolean {
  if (!expression) return false;
  if (ts.isIdentifier(expression) && expression.text === "undefined") return true;
  if (ts.isVoidExpression(expression)) {
    const inner = expression.expression;
    return ts.isNumericLiteral(inner)
      ? inner.text === "0"
      : ts.isIdentifier(inner) && inner.text === "undefined";
  }
  if (ts.isArrowFunction(expression) || ts.isFunctionExpression(expression)) {
    return isNoopBody(expression.body);
  }
  return false;
}

function isNoopBody(body: ts.Block | ts.Expression | undefined): boolean {
  if (!body) return false;
  if (!ts.isBlock(body)) return isNoopExpression(body);
  if (body.statements.length === 0) return true;
  return body.statements.every((statement) => {
    if (ts.isReturnStatement(statement)) {
      return !statement.expression || isNoopExpression(statement.expression);
    }
    if (ts.isExpressionStatement(statement)) return isNoopExpression(statement.expression);
    return false;
  });
}

function isUserFacingString(node: ts.Node, context: CheckContext): boolean {
  if (!isStringLike(node)) return false;
  const parent = node.parent;
  if (!parent) return false;
  if (ts.isJsxExpression(parent) && parent.parent && ts.isJsxElement(parent.parent)) return true;
  if (ts.isJsxAttribute(parent)) {
    return USER_FACING_ATTRIBUTES.has(parent.name.getText(context.sourceFile));
  }
  return false;
}

function isAllowed(node: ts.Node, context: CheckContext): boolean {
  const line = context.sourceFile.getLineAndCharacterOfPosition(
    node.getStart(context.sourceFile),
  ).line;
  return context.allowMarkers.some((marker) => marker === line + 1 || marker === line);
}

function report(
  node: ts.Node,
  context: CheckContext,
  rule: string,
  message: string,
  fileName: string,
): void {
  if (isAllowed(node, context)) return;
  const line = context.sourceFile.getLineAndCharacterOfPosition(
    node.getStart(context.sourceFile),
  ).line;
  context.violations.push({ fileName, line: line + 1, rule, message });
}

type JsxTag = ts.JsxOpeningElement | ts.JsxSelfClosingElement;

function jsxAttributes(element: JsxTag): ts.JsxAttribute[] {
  return element.attributes.properties.filter(ts.isJsxAttribute);
}

function isHandledForm(form: ts.JsxElement, context: CheckContext): boolean {
  return jsxAttributes(form.openingElement).some((attribute) => {
    const name = attribute.name.getText(context.sourceFile);
    if (name === "onSubmit") {
      return attribute.initializer !== undefined && !isNoopAttribute(attribute);
    }
    if (name === "action") {
      const value = staticString(attribute.initializer);
      return value === undefined ? attribute.initializer !== undefined : value.length > 0;
    }
    if (name === "method") {
      const method = staticString(attribute.initializer)?.toLowerCase();
      return method === "get" || method === "post";
    }
    return false;
  });
}

function isNoopAttribute(attribute: ts.JsxAttribute): boolean {
  const initializer = attribute.initializer;
  if (!initializer || !ts.isJsxExpression(initializer)) return false;
  return isNoopExpression(initializer.expression);
}

function isDisabledWithReason(
  attributes: readonly ts.JsxAttribute[],
  context: CheckContext,
  button: JsxTag,
): boolean {
  if (!attributes.some((attribute) => attribute.name.getText(context.sourceFile) === "disabled")) {
    return false;
  }
  const hasReason = attributes.some((attribute) => {
    const name = attribute.name.getText(context.sourceFile);
    return name === "title" || name === "aria-label" || name === "aria-describedby"
      ? Boolean(staticString(attribute.initializer)?.trim())
      : false;
  });
  return hasReason || isAllowed(button, context);
}

function checkJsxTag(
  node: JsxTag,
  ancestors: readonly ts.Node[],
  context: CheckContext,
  fileName: string,
): void {
  const sourceFile = context.sourceFile;
  const name = node.tagName.getText(sourceFile);
  const attributes = jsxAttributes(node);
  const byName = new Map(
    attributes.map((attribute) => [attribute.name.getText(sourceFile), attribute] as const),
  );

  const href = byName.get("href");
  if (href) {
    const value = staticString(href.initializer);
    if (value === "#" || value === "" || /^javascript:/i.test(value ?? "")) {
      report(
        href,
        context,
        "fake-href",
        `href="${value ?? ""}" has no real destination.`,
        fileName,
      );
    }
  } else if (name === "a") {
    report(node, context, "anchor-without-href", "Anchor has no href attribute.", fileName);
  }

  for (const attribute of attributes) {
    const attributeName = attribute.name.getText(sourceFile);
    if (
      (/^on[A-Z]/.test(attributeName) || attributeName === "formAction") &&
      isNoopAttribute(attribute)
    ) {
      report(
        attribute,
        context,
        "no-op-handler",
        `${attributeName} handler does nothing.`,
        fileName,
      );
    }
  }

  if (name !== "button" && name !== "Button") return;

  const onClick = byName.get("onClick");
  const formAction = byName.get("formAction");
  const formAncestor = ancestors.find(
    (ancestor) =>
      ts.isJsxElement(ancestor) && ancestor.openingElement.tagName.getText(sourceFile) === "form",
  );
  const isSubmitInForm =
    staticString(byName.get("type")?.initializer) === "submit" &&
    formAncestor !== undefined &&
    ts.isJsxElement(formAncestor) &&
    isHandledForm(formAncestor, context);

  if (
    onClick === undefined &&
    formAction === undefined &&
    !isSubmitInForm &&
    !isDisabledWithReason(attributes, context, node)
  ) {
    report(
      node,
      context,
      "button-without-handler",
      "Button has no onClick, formAction, submit form, or disabled reason.",
      fileName,
    );
  }
}

function checkImportPath(
  moduleSpecifier: ts.Expression,
  context: CheckContext,
  fileName: string,
): void {
  if (!isStringLike(moduleSpecifier)) return;
  if (!/(mock|fixture|dummy)/i.test(moduleSpecifier.text)) return;
  report(
    moduleSpecifier,
    context,
    "mock-import",
    `Import path "${moduleSpecifier.text}" references mock/fixture/dummy code.`,
    fileName,
  );
}

function checkSourceText(node: ts.Node, context: CheckContext, fileName: string): void {
  let text: string | undefined;
  if (ts.isJsxText(node)) text = node.text;
  else if (isUserFacingString(node, context)) text = isStringLike(node) ? node.text : undefined;
  if (!text) return;

  if (FAKE_TEXT.test(text)) {
    report(
      node,
      context,
      "fake-text",
      `User-visible text contains a placeholder phrase: ${text.trim()}.`,
      fileName,
    );
  }
  if (TODO_TEXT.test(text)) {
    report(
      node,
      context,
      "todo-in-text",
      `User-visible text contains TODO/FIXME: ${text.trim()}.`,
      fileName,
    );
  }
}

function visit(
  node: ts.Node,
  ancestors: readonly ts.Node[],
  context: CheckContext,
  fileName: string,
): void {
  if (ts.isImportDeclaration(node)) checkImportPath(node.moduleSpecifier, context, fileName);
  if (
    ts.isCallExpression(node) &&
    node.expression.kind === ts.SyntaxKind.ImportKeyword &&
    node.arguments.length > 0
  ) {
    checkImportPath(node.arguments[0], context, fileName);
  }
  if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
    checkJsxTag(node, ancestors, context, fileName);
  }
  checkSourceText(node, context, fileName);

  const nextAncestors = [...ancestors, node];
  node.forEachChild((child) => {
    visit(child, nextAncestors, context, fileName);
  });
}

export function checkSource(source: string, fileName: string): FakeUiViolation[] {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const allowMarkers: number[] = [];
  source.split(/\r?\n/).forEach((line, index) => {
    if (ALLOW_MARKER.test(line)) allowMarkers.push(index + 1);
  });

  const context: CheckContext = { sourceFile, allowMarkers, violations: [] };
  visit(sourceFile, [], context, fileName);
  return context.violations;
}

function collectTsxFiles(directory: string): string[] {
  if (!existsSync(directory)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...collectTsxFiles(fullPath));
    else if (entry.isFile() && entry.name.endsWith(".tsx")) files.push(fullPath);
  }
  return files.sort();
}

function main(): void {
  const root = process.cwd();
  const files = [
    ...collectTsxFiles(path.join(root, "src", "app")),
    ...collectTsxFiles(path.join(root, "src", "modules")),
  ];
  const violations = files.flatMap((file) =>
    checkSource(readFileSync(file, "utf8"), path.relative(root, file).split(path.sep).join("/")),
  );

  if (violations.length === 0) {
    console.info(`zero-fake-ui check passed (${files.length} TSX file(s) scanned).`);
    return;
  }

  for (const violation of violations) {
    console.error(
      `${violation.fileName}:${violation.line} ${violation.rule}: ${violation.message}`,
    );
  }
  console.error(`zero-fake-ui check failed with ${violations.length} violation(s).`);
  process.exitCode = 1;
}

if (path.basename(process.argv[1] ?? "") === "check-no-fake-ui.ts") main();
