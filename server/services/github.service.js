import axios from "axios";

export const getRepository = async (owner, repo) => {
    try{
      console.log(`https://api.github.com/repos/${owner}/${repo}`)
  const response = await axios.get(
    `https://api.github.com/repos/${owner}/${repo}`,
    
  );
 
  return response.data;
}catch{
    return null;
}
};