import { useEffect, useState } from "react";
import DashboardLayout from "../layouts/DashboardLayout";
import StatsCard from "../components/StatsCard/StatsCard";

import { getRepositories } from "../api/repository.api";

export default function Dashboard() {
  const [repositories, setRepositories] = useState([]);

  useEffect(() => {
    const fetchRepositories = async () => {
      try {
        const data = await getRepositories();

        setRepositories(data.repositories);
      } catch (error) {
        console.error(error);
      }
    };

    fetchRepositories();
  }, []);

  return (
    <DashboardLayout>
      <h1 className="text-4xl font-bold mb-8">
        Dashboard
      </h1>

      <div className="grid grid-cols-4 gap-6">
        <StatsCard
          title="Repositories"
          value={repositories.length}
          color="border-blue-500"
        />

        <StatsCard
          title="Deployments"
          value="-"
          color="border-green-500"
        />

        <StatsCard
          title="Running Apps"
          value="-"
          color="border-yellow-500"
        />

        <StatsCard
          title="Success Rate"
          value="-"
          color="border-purple-500"
        />
      </div>
    </DashboardLayout>
  );
}