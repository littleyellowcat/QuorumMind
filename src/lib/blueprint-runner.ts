import type { DecisionContext, DecisionMode } from "./domain";
import type { BlueprintRoomResult } from "./blueprint";
import { contextForQuestion } from "./question-context";
import type { Locale } from "../types/app";

export async function runLocalBlueprint(question: string, locale: Locale, mode?: DecisionMode, context?: DecisionContext): Promise<BlueprintRoomResult>;
export async function runLocalBlueprint(question: string): Promise<BlueprintRoomResult>;
export async function runLocalBlueprint(question: string, locale: Locale = "zh", mode: DecisionMode = "deep", context?: DecisionContext) {
  const { runBlueprintRoom } = await import("../lib/blueprint");
  return runBlueprintRoom({
    question,
    mode,
    locale,
    context: context ?? contextForQuestion(question)
  });
}
