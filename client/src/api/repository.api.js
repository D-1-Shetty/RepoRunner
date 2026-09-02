import api from "./api";

export const getRepositories = async () => {
  const response = await api.get("/repositories");

  return response.data;
};

export const deployRepository = async (repositoryId, config) => {
  // `config` is an optional { env: { KEY: value, ... } } object. It is sent
  // in the authenticated request body - never as a URL parameter.
  const response = await api.post(
    `/repositories/${repositoryId}/clone`,
    config
  );

  return response.data;
};

export const getRepositoryById = async (id) => {
  const response = await api.get(`/repositories/${id}`);
  return response.data;
};

export const deleteRepository = async (repositoryId) => {
  const { data } = await api.delete(
    `/repositories/${repositoryId}`
  );

  return data;
};

export const importRepository = async (repositoryData) => {
  const { data } = await api.post(
    "/repositories",
    repositoryData
  );

  return data;
};

export const getRepositoryEnv = async (repositoryId) => {
  const { data } = await api.get(
    `/repositories/${repositoryId}/env`
  );

  return data;
};

// `env` is an array of { key, value, secret } - sent in the request body,
// never as a query parameter.
export const updateRepositoryEnv = async (repositoryId, env) => {
  const { data } = await api.put(
    `/repositories/${repositoryId}/env`,
    { env }
  );

  return data;
};

export const stopApplication = async (repositoryId, applicationName) => {
  const { data } = await api.post(
    `/repositories/${repositoryId}/applications/${encodeURIComponent(
      applicationName
    )}/stop`
  );

  return data;
};

export const restartApplication = async (repositoryId, applicationName) => {
  const { data } = await api.post(
    `/repositories/${repositoryId}/applications/${encodeURIComponent(
      applicationName
    )}/restart`
  );

  return data;
};