import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import Typo from "typo-js";

let dictionary: Typo | null = null;
let dictionaryLoading = false;

const AUTOCORRECT_ENABLED_STORAGE_KEY = "vault-setting-autocorrect-enabled";

function isAutocorrectEnabled(): boolean {
  if (typeof window === "undefined") {
    return true;
  }
  return localStorage.getItem(AUTOCORRECT_ENABLED_STORAGE_KEY) !== "false";
}

// Load dictionary asynchronously
async function loadDictionary(): Promise<Typo | null> {
  if (dictionary) return dictionary;
  if (dictionaryLoading) return null;
  
  dictionaryLoading = true;
  
  try {
    const [affResponse, dicResponse] = await Promise.all([
      fetch("/dictionaries/en_GB.aff"),
      fetch("/dictionaries/en_GB.dic"),
    ]);
    
    const [affData, dicData] = await Promise.all([
      affResponse.text(),
      dicResponse.text(),
    ]);
    
    dictionary = new Typo("en_GB", affData, dicData);
    console.log("Dictionary loaded successfully");
    return dictionary;
  } catch (error) {
    console.error("Failed to load dictionary:", error);
    dictionaryLoading = false;
    return null;
  }
}

// Start loading immediately
loadDictionary();

export const AutoCorrect = Extension.create({
  name: "autoCorrect",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("autoCorrect"),
        props: {
          handleTextInput(view, from, _to, text) {
            if (!isAutocorrectEnabled()) {
              return false;
            }

            // Only trigger on space or punctuation (word completed)
            if (!/[\s.,!?;:\)]/.test(text)) {
              return false;
            }

            // Don't block - if dictionary isn't ready, skip
            if (!dictionary) {
              return false;
            }

            const { state } = view;
            const $from = state.doc.resolve(from);
            const textBefore = $from.parent.textContent.slice(0, $from.parentOffset);
            
            // Find the last word (only letters, no numbers/special chars)
            const wordMatch = textBefore.match(/([a-zA-Z]+)$/);
            if (!wordMatch) {
              return false;
            }

            const word = wordMatch[1];

            // Skip capitalised words (likely names/proper nouns)
            if (/^[A-Z]/.test(word)) {
              return false;
            }
            
            // Skip very short words (1-2 chars) - too risky
            if (word.length < 3) {
              return false;
            }

            // Store info for async correction
            const wordStart = from - word.length;
            
            // Let the input go through immediately - don't block
            // Then check spelling async
            setTimeout(() => {
              if (!dictionary) return;
              
              // Check if word is spelled correctly
              if (dictionary.check(word)) {
                return;
              }

              // Get suggestions
              const suggestions = dictionary.suggest(word);
              if (!suggestions || suggestions.length === 0) {
                return;
              }

              // Use the first suggestion
              let correction = suggestions[0];

              // Preserve case pattern
              if (word === word.toUpperCase()) {
                correction = correction.toUpperCase();
              } else if (word[0] === word[0].toUpperCase()) {
                correction = correction.charAt(0).toUpperCase() + correction.slice(1);
              }

              // Get fresh state (may have changed)
              const currentState = view.state;
              
              // Adjust positions since we added the space/punctuation
              const adjustedStart = wordStart;
              const adjustedEnd = wordStart + word.length;
              
              // Make sure the text is still what we expect
              const currentText = currentState.doc.textBetween(adjustedStart, adjustedEnd, "");
              if (currentText !== word) {
                return; // Text changed, abort
              }

              // Create transaction to replace the word
              const tr = currentState.tr.replaceWith(
                adjustedStart,
                adjustedEnd,
                currentState.schema.text(correction)
              );

              view.dispatch(tr);
            }, 0);

            // Return false to let default handling proceed (don't block typing)
            return false;
          },
        },
      }),
    ];
  },
});
