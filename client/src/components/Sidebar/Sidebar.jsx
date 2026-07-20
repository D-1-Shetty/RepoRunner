import { NavLink } from "react-router-dom";

const links = [
  {
    name: "Dashboard",
    path: "/dashboard",
  },
  {
    name: "Repositories",
    path: "/repositories",
  },
  {
    name: "Deployments",
    path: "/deployments",
  },
  {
    name: "Running Apps",
    path: "/running-apps",
  },
];

export default function Sidebar() {
  return (
    <aside className="w-64 bg-slate-900 text-white">

      <div className="text-2xl font-bold p-6 border-b border-slate-700">
        RepoRunner
      </div>

      <nav className="flex flex-col mt-4">

        {links.map((link) => (
          <NavLink
            key={link.path}
            to={link.path}
            className={({ isActive }) =>
              `px-6 py-4 transition ${
                isActive
                  ? "bg-blue-600"
                  : "hover:bg-slate-800"
              }`
            }
          >
            {link.name}
          </NavLink>
        ))}

      </nav>

    </aside>
  );
}