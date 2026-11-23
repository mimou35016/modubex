export type ModuleSettingFieldType = "string" | "number" | "boolean" | "enum";

/** Plain, serializable metadata. Zod schemas never cross into the client. */
export type ModuleSettingField = {
  key: string;
  name: string;
  label: string;
  description?: string;
  value: string | number | boolean;
  type: ModuleSettingFieldType;
  options?: string[];
  required: boolean;
};
