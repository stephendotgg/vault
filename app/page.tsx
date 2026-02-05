export default function Home() {
  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center h-11 px-3 border-b border-[#2f2f2f] shrink-0">
        <div className="flex items-center gap-2 text-sm text-[#9b9b9b]">
          <span className="hover:bg-[#2f2f2f] px-1.5 py-0.5 rounded cursor-pointer">Home</span>
        </div>
      </div>
      
      {/* Content area */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-3xl mx-auto px-24 py-20">
          <h1 className="text-4xl font-bold text-[#e3e3e3] mb-4">Welcome to Mothership</h1>
          <p className="text-[#9b9b9b] text-lg">
            Start writing here...
          </p>
        </div>
      </div>
    </div>
  );
}
