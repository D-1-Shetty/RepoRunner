import axios from "axios";

export const getRepository = async (owner, repo) => {
    try{
  const response = await axios.get(
    `https://api.github.com/repos/${owner}/${repo}`
  );

  return response.data;
}catch{
    return null;
}
};