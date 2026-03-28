import { Node, mergeAttributes } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

export interface NoteLinkOptions {
  onNavigate: (noteId: string) => void;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    noteLink: {
      insertNoteLink: (noteId: string, title: string) => ReturnType;
    };
  }
}

export const NoteLink = Node.create<NoteLinkOptions>({
  name: "noteLink",
  group: "inline",
  inline: true,
  atom: true,

  addOptions() {
    return {
      onNavigate: () => {},
    };
  },

  addAttributes() {
    return {
      noteId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-note-id"),
        renderHTML: (attributes) => ({
          "data-note-id": attributes.noteId as string,
        }),
      },
      title: {
        default: "Untitled",
        parseHTML: (element) => element.textContent || "Untitled",
        renderHTML: () => ({}),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-note-link]",
      },
    ];
  },

  renderHTML({ HTMLAttributes, node }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-note-link": "",
        class: "note-link",
        contenteditable: "false",
      }),
      node.attrs.title as string,
    ];
  },

  addNodeView() {
    return ({ node, HTMLAttributes }) => {
      const dom = document.createElement("span");
      dom.classList.add("note-link");
      dom.setAttribute("data-note-link", "");
      dom.setAttribute("data-note-id", node.attrs.noteId as string);
      dom.contentEditable = "false";
      dom.textContent = node.attrs.title as string;

      for (const [key, value] of Object.entries(HTMLAttributes)) {
        if (typeof value === "string") {
          dom.setAttribute(key, value);
        }
      }

      dom.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const noteId = node.attrs.noteId as string;
        if (noteId) {
          this.options.onNavigate(noteId);
        }
      });

      return { dom };
    };
  },

  addCommands() {
    return {
      insertNoteLink:
        (noteId: string, title: string) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: { noteId, title },
          });
        },
    };
  },

  addProseMirrorPlugins() {
    const type = this.type;

    return [
      new Plugin({
        key: new PluginKey("noteLinkPaste"),
        props: {
          handlePaste(view, event) {
            const clipboard = event.clipboardData;
            if (!clipboard) return false;

            const plainText = clipboard.getData("text/plain").trim();

            // Match [Title](vault://note/id) format
            const markdownMatch = plainText.match(
              /^\[([^\]]+)\]\(vault:\/\/note\/([a-zA-Z0-9_-]+)\)$/
            );
            if (markdownMatch) {
              event.preventDefault();
              const [, title, noteId] = markdownMatch;
              const node = type.create({ noteId, title });
              const { from, to } = view.state.selection;
              view.dispatch(view.state.tr.replaceWith(from, to, node));
              return true;
            }

            // Match plain vault://note/id format
            const plainMatch = plainText.match(
              /^vault:\/\/note\/([a-zA-Z0-9_-]+)$/
            );
            if (plainMatch) {
              event.preventDefault();
              const noteId = plainMatch[1];
              const node = type.create({ noteId, title: "Untitled" });
              const { from, to } = view.state.selection;
              view.dispatch(view.state.tr.replaceWith(from, to, node));
              return true;
            }

            return false;
          },
        },
      }),
    ];
  },
});
