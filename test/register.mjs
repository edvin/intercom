// Lets Node run the Worker sources directly: resolve extensionless relative imports to .ts files.
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (e) {
      if (specifier.startsWith(".") && !/\.[a-z]+$/.test(specifier)) return next(`${specifier}.ts`, context);
      throw e;
    }
  },
});
