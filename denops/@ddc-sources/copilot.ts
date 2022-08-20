import { buffers } from "https://deno.land/x/denops_std@v3.0.0/variable/mod.ts";
import {
  BaseSource,
  GatherArguments,
  OnCompleteDoneArguments,
} from "https://deno.land/x/ddc_vim@v2.3.1/base/source.ts";
import {
  DdcGatherItems,
  Item,
} from "https://deno.land/x/ddc_vim@v2.3.1/types.ts";
import { delay } from "https://deno.land/std@0.123.0/async/delay.ts";

export type CompletionMetadata = {
  word: string;
};

type Copilot = {
  first?: {
    status: string;
  };
  cycling?: {
    status: string;
  };
  suggestions: Array<{
    displayText: string;
    position: { character: number; line: number };
    range: {
      start: { character: number; line: number };
      end: { character: number; line: number };
    };
    text: string;
    uuid: string;
  }>;
};

export class Source extends BaseSource<Record<string, never>> {
  private counter = 0;
  async gather(
    args: GatherArguments<Record<string, never>>,
  ): Promise<DdcGatherItems> {
    this.counter = (this.counter + 1) % 100;

    const id = `source/${this.name}/${this.counter}`;
    const [payload] = await Promise.all([
      args.onCallback(id) as Promise<{
        items: Item[];
        isIncomplete: boolean;
      }>,
      this.request(id, args),
    ]);

    return { items: payload.items, isIncomplete: payload.isIncomplete };
  }

  async request(id: string, args: GatherArguments<Record<string, never>>) {
    let copilot:
      | Copilot
      | undefined = undefined;

    while (copilot?.suggestions == null) {
      copilot = await buffers.get(args.denops, "_copilot") as
        | Copilot
        | undefined;

      // await args.denops.call("ddc#callback", id, {
      //   items: [],
      //   isIncomplete: false,
      // });

      await delay(10);
    }

    const items = copilot.suggestions.map(({ text }) => {
      const match = /^(?<indent>\s*).+/.exec(text);
      const indent = match?.groups?.indent;

      let info: string;
      if (indent != null) {
        info = text
          .split("\n")
          .map((line) => line.slice(indent.length))
          .join("\n");
      } else {
        info = text;
      }
      return {
        word: text.split("\n")[0].slice(args.completePos),
        info,
        menu: "copilot",
        user_data: { word: text },
      };
    });

    args.denops.call("ddc#callback", id, {
      items,
      isIncomplete: true,
    });
  }

  params() {
    return {};
  }

  async onCompleteDone(
    args: OnCompleteDoneArguments<Record<string, never>, CompletionMetadata>,
  ) {
    const firstLine = args.userData?.word.split("\n")[0];
    const currentLine = (await args.denops.call("getline", ".")) as string;
    if (currentLine !== firstLine) {
      return;
    }

    const lines = args.userData?.word.split("\n");
    if (lines != null && lines[1] != null) {
      const lnum = (await args.denops.call("line", ".")) as number;
      const appendLines = lines.slice(1);
      await args.denops.call("append", lnum, appendLines);
      await args.denops.call("setpos", ".", [
        0,
        lnum + appendLines.length,
        appendLines.slice(-1)[0].length + 1,
      ]);
    }
  }
}
