import { exec } from 'child_process';

function runCmd(cmd: string): Promise<string> {
  return new Promise((resolve) => {
    exec(cmd, (err, stdout, stderr) => {
      resolve(`Command: ${cmd}\nExit Code: ${err ? err.code : 0}\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
    });
  });
}

async function main() {
  console.log('Checking git availability...');
  console.log(await runCmd('git --version'));
  console.log(await runCmd('git config --list'));
  console.log(await runCmd('ssh -T git@github.com'));
}

main();
