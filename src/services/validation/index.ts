/**
 * Validation module exports
 */

export * from "./types";
export { validateConfiguration, validateBasic } from "./configurationValidator";
export {
  registerRealTimeValidation,
  dispose as disposeRealTimeValidation,
} from "./realtimeValidator";
