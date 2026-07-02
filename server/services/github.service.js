import axios from "axios";
import { exec } from "child_process";
import { promisify } from "util";
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


const execAsync = promisify(exec);

export const cloneRepository = async (cloneUrl, destination) => {
  await execAsync(`git clone ${cloneUrl} ${destination}`);
};