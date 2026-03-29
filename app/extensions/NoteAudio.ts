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
      duration: {
        default: 0,
        parseHTML: (element) => {
          const val = element.getAttribute("data-duration");
          return val ? parseInt(val, 10) : 0;
        },
        renderHTML: (attributes) => ({
          "data-duration": String(attributes.duration ?? 0),
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
      const filename = (node.attrs.filename as string) || "Voice";
      const storedDuration = Number(node.attrs.duration) || 0;
      const displayName = filename.endsWith(".webm") || filename.endsWith(".ogg")
        ? filename.replace(/\.[^.]+$/, "")
        : filename;

      function fmtTime(seconds: number): string {
        if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s.toString().padStart(2, "0")}`;
      }

      dom.innerHTML = `
        <div class="note-audio-player">
          <button class="note-audio-play-btn" title="Play">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="6,3 20,12 6,21" />
            </svg>
          </button>
          <div class="note-audio-info">
            <span class="note-audio-name">${displayName}</span>
            <span class="note-audio-time">${fmtTime(storedDuration)}</span>
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
      const totalDuration = storedDuration;

      function getDuration(): number {
        if (audio && Number.isFinite(audio.duration) && audio.duration > 0) return audio.duration;
        return totalDuration;
      }

      function updateProgress() {
        if (!audio) return;
        const dur = getDuration();
        const pct = dur ? (audio.currentTime / dur) * 100 : 0;
        progressFill.style.width = `${pct}%`;
        timeEl.textContent = playing ? fmtTime(audio.currentTime) : fmtTime(dur);
      }

      playBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (!audio) {
          audio = new Audio(src);
          audio.addEventListener("timeupdate", updateProgress);
          audio.addEventListener("ended", () => {
            playing = false;
            playBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="6,3 20,12 6,21" /></svg>';
            progressFill.style.width = "0%";
            if (audio) audio.currentTime = 0;
            timeEl.textContent = fmtTime(getDuration());
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
