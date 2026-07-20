export default function Navbar() {
  return (
    <header className="h-16 bg-white border-b flex items-center justify-between px-6 shadow-sm">

      <h1 className="text-2xl font-bold text-blue-600">
        RepoRunner
      </h1>

      <div className="flex items-center gap-4">

        <span className="font-medium">
          Divan
        </span>

        <button
          className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded"
        >
          Logout
        </button>

      </div>

    </header>
  );
}