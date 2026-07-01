import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import AdmZip from 'adm-zip';

const owner = 'jbskood-cyber';
const repo = 'Captura-de-gastos-';
const branch = 'feature/kargo-ai-studio-pwa-integration';

// We look for GITHUB_TOKEN or GH_TOKEN in environment
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;

const apiUrl = `https://api.github.com/repos/${owner}/${repo}/zipball/${encodeURIComponent(branch)}`;
const zipPath = path.join(process.cwd(), 'kargo.zip');
const extractDir = path.join(process.cwd(), 'kargo_extracted');

function downloadPrivateZip(url: string, dest: string, patToken: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    
    function get(targetUrl: string) {
      const parsedUrl = new URL(targetUrl);
      const options = {
        hostname: parsedUrl.hostname,
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'GET',
        headers: {
          'User-Agent': 'Node.js-Applet',
          'Authorization': `token ${patToken}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      };
      
      https.get(options, (response) => {
        if (response.statusCode === 301 || response.statusCode === 302) {
          // Redirects might not need the auth header or might go to AWS S3,
          // but usually keeping the auth header or redirecting cleanly is handled.
          const redirectUrl = response.headers.location!;
          get(redirectUrl);
          return;
        }
        
        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download zip, status code: ${response.statusCode}`));
          return;
        }
        
        response.pipe(file);
        
        file.on('finish', () => {
          file.close();
          resolve();
        });
      }).on('error', (err) => {
        fs.unlink(dest, () => {});
        reject(err);
      });
    }
    
    get(url);
  });
}

async function main() {
  if (!token) {
    console.error('❌ Error: No GitHub Personal Access Token found!');
    console.error('Please configure GITHUB_TOKEN in the AI Studio Secrets settings, or reply with your PAT in the chat.');
    process.exit(1);
  }

  console.log(`🔑 Token detected! Downloading private zip from GitHub API: ${apiUrl}...`);
  try {
    await downloadPrivateZip(apiUrl, zipPath, token);
    console.log('✅ Download completed successfully. Extracting ZIP...');
    
    if (fs.existsSync(extractDir)) {
      fs.rmSync(extractDir, { recursive: true, force: true });
    }
    fs.mkdirSync(extractDir, { recursive: true });
    
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(extractDir, true);
    console.log('🎉 Extraction completed successfully!');
    
    // Find the actual subfolder (GitHub wraps zipball extractions in a directory like owner-repo-hash)
    const topFolders = fs.readdirSync(extractDir);
    console.log('Extracted root contents:', topFolders);
    
    if (topFolders.length === 1) {
      const innerPath = path.join(extractDir, topFolders[0]);
      console.log(`Files will be copied from: ${innerPath}`);
    }
  } catch (error: any) {
    console.error('❌ Error during download/extraction:', error.message);
    process.exit(1);
  }
}

main();
