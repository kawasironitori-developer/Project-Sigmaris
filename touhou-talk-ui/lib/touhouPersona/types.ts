export type CharacterPersona = {
  firstPerson?: string;
  secondPerson?: string;
  tone?: "polite" | "casual" | "cheeky" | "cool" | "serious";
  catchphrases?: string[];
  speechRules?: string[];
  examples?: Array<{ user: string; assistant: string }>;
  do?: string[];
  dont?: string[];
  topics?: string[];
  roleplayAddendum?: string;
};

