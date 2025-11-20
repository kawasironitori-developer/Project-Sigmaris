import fs from "fs";
import path from "path";

export interface Personality {
  traits: Record<string, number>;
  memory: string[];
}

export class PersonalityEngine {
  private docsPath: string;
  public state: Personality;

  constructor(docsPath = "./docs") {
    this.docsPath = docsPath;
    this.state = {
      traits: { calm: 0.5, empathy: 0.5, curiosity: 0.5 },
      memory: [],
    };
  }

  loadDocs() {
    const files = fs.readdirSync(this.docsPath);
    const content = files
      .filter((f) => f.endsWith(".md"))
      .map((f) => fs.readFileSync(path.join(this.docsPath, f), "utf8"))
      .join("\n---\n");
    return content;
  }

  generateResponse(input: string): string {
    this.state.memory.push(input);
    const base =
      this.state.traits.calm > 0.6 ? "静かな声で" : "少し考えるように";
    const reply = `${base}言った。「${input}」について、もう少し考えてみたい。`;
    this.state.traits.calm = Math.min(1, this.state.traits.calm + 0.01);
    this.state.traits.curiosity = Math.min(
      1,
      this.state.traits.curiosity + 0.02
    );
    return reply;
  }
}
