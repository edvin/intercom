// Files bundled as text by the wrangler "Text" rule.
declare module "*.sh" {
  const content: string;
  export default content;
}
declare module "*.md" {
  const content: string;
  export default content;
}
declare module "*.sql" {
  const content: string;
  export default content;
}
declare module "*.mjs" {
  const content: string;
  export default content;
}
declare module "*.woff2" {
  const content: ArrayBuffer;
  export default content;
}
