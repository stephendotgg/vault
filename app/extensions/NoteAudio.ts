import { Node, mergeAttributes } from "@tiptap/core";

export const NoteAudio = Node.create({
  name: "noteAudio",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      src: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-src"),
        renderHTML: (attributes) => ({
          "data-src": attributes.src as string,
        }),
      },
      filename: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-filename") || "",
        renderHTML: (attributes) => ({
          "data-filename": attributes.filename as string,
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-note-audio]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-note-audio": "",
        class: "note-audio-wrapper",
      }),
    ];
  },

  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement("div");
      dom.classList.add("note-audio-wrapper");
      dom.setAttribute("data-note-audio", "");
      dom.contentEditable = "false";

      const src = node.attrs.src as string;
      const filename = (node.attrs.filename as string) || "Voice recording";
      const displayName = filename.endsWith(".webm") || filename.endsWith(".ogg")
        ? filename.replace(/\.[^.]+$/, "")
        : filename;

      dom.innerHTML = `
        <div class="note-audio-player">
          <button class="note-audio-play-btn" title="Play">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="6,3 20,12 6,21" />
            </svg>
          </button>
          <div class="note-audio-info">
            <span class="note-audio-name">${displayName}</span>
            <span class="note-audio-time">0:00</span>
          </div>
          <div class="note-audio-progress-bar">
            <div class="note-audio-progress-fill"></div>
          </div>
        </div>
      `;

      const playBtn = dom.querySelector(".note-audio-play-btn") as HTMLButtonElement;
      const timeEl = dom.querySelector(".note-audio-time") as HTMLSpanElement;
      const progressBar = dom.querySelector(".note-audio-progress-bar") as HTMLDivElement;
      const progressFill = dom.querySelector(".note-audio-progress-fill") as HTMLDivElement;

      let audio: HTMLAudioElement | null = null;
      let playing = false;

      function formatTime(seconds: number): string {
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s.toString().padStart(2, "0")}`;
      }

      function updateProgress() {
        if (!audio) return;
        const pct = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0;
        progressFill.style.width = `${pct}%`;
        timeEl.textContent = playing ? formatTime(audio.currentTime) : formatTime(audio.duration);
      }

      // Preload metadata to show total duration immediately
      const preloadAudio = new Audio();
      preloadAudio.preload = "metadata";
      preloadAudio.addEventListener("loadedmetadata", () => {
        if (!playing) {
          timeEl.textContent = formatTime(preloadAudio.duration);
        }
      });
      preloadAudio.src = src;

      playBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (!audio) {
          audio = new Audio(src);
          audio.addEventListener("timeupdate", updateProgress);
          audio.addEventListener("loadedmetadata", () => {
            timeEl.textContent = formatTime(audio!.duration);
          });
          audio.addEventListener("ended", () => {
            playing = false;
            playBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="6,3 20,12 6,21" /></svg>';
            progressFill.style.width = "0%";
            if (audio) {
              audio.currentTime = 0;
              timeEl.textContent = formatTime(audio.duration);
            }
          });
        }

        if (playing) {
          audio.pause();
          playing = false;
          playBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="6,3 20,12 6,21" /></svg>';
        } else {
          audio.play();
          playing = true;
          playBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="3" width="4" height="18" /><rect x="15" y="3" width="4" height="18" /></svg>';
        }
      });

      progressBar.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!audio || !audio.duration) return;
        const rect = progressBar.getBoundingClientRect();
        const pct = (e.clientX - rect.left) / rect.width;
        audio.currentTime = pct * audio.duration;
        updateProgress();
      });

      return { dom };
    };
  },
});
