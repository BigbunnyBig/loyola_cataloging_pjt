// CloudService.js

const { spawn } = require('child_process');
const path = require('path');

// =========================================================
// 🔑 사용자 설정 변수 (이 부분만 수정하세요)
// =========================================================

/**
 * CloudType에서 발급받은 실제 API Key를 여기에 입력하세요.
 * (예: '1a2b3c4d5e6f7g8h9i0j...')
 */
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1aWQiOiJtZ21icHdja2FhOTAxMTBjIiwiaWF0IjoxNzYwMTkyOTQwfQ.eRnL3qLPPGa7nFgnBc8M-Vb2GjF7rrfdKIlGMt5oVYI';

/**
 * 배포할 CloudType 프로젝트 이름을 여기에 입력하세요.
 * (예: 'my-awesome-project')
 */
const PROJECT_NAME = 'loyola_pjt:main';

// 배포(ctype apply) 명령을 실행할지 여부
const SHOULD_APPLY = true; // true로 설정하면 자동으로 배포까지 진행됩니다.

// =========================================================
// 💡 내부 로직 (수정하지 마세요)
// =========================================================

// 사용할 cloudtype 설정 파일의 경로 (pkg assets에 포함되어야 함)
const APP_YAML_PATH = path.join(__dirname, 'cloudtype', 'app.yaml');

/**
 * 'ctype' CLI 명령을 실행하는 함수
 * @param {string} command ctype 뒤에 올 명령어와 인자들
 * @returns {Promise<void>}
 */
function runCtypeCommand(command) {
    return new Promise((resolve, reject) => {
        const [subCommand, ...args] = command.split(' ').filter(a => a);

        // API 키와 같은 민감 정보 보호를 위해 '-t' 뒤의 인수를 마스킹하여 출력
        const displayArgs = args.map(a => {
            if (subCommand === 'login' && a.length > 10) {
                return '***(마스킹됨)***';
            }
            return a;
        });
        
        console.log(`\n▶ ctype ${subCommand} ${displayArgs.join(' ')}`);

        const ctypeExecutable = process.platform === 'win32' ? 'ctype.cmd' : 'ctype';

        const child = spawn(ctypeExecutable, [subCommand, ...args], {
            stdio: 'inherit',
            shell: true
        });

        child.on('error', (err) => {
            console.error(`❌ ctype 실행 오류: ${err.message}`);
            reject(err);
        });

        child.on('close', (code) => {
            if (code === 0) {
                console.log(`✅ ctype ${subCommand} 성공적으로 완료됨.`);
                resolve();
            } else {
                console.error(`❌ ctype ${subCommand} 프로세스가 코드 ${code}로 종료되었습니다.`);
                reject(new Error(`ctype process exited with code ${code}`));
            }
        });
    });
}

/**
 * 배포 스크립트의 메인 함수
 */
async function main() {
    // 필수 변수 누락 확인
    if (API_KEY === '<여기에 실제 API Key를 입력하세요>' || PROJECT_NAME === '<여기에 실제 프로젝트 이름을 입력하세요>') {
        console.error("❌ 오류: API_KEY 또는 PROJECT_NAME 변수를 설정하지 않았습니다.");
        console.error("index.js 파일 상단의 사용자 설정 변수를 수정하세요.");
        process.exit(1);
    }
    
    try {
        // 1. ctype login -t (API_KEY)
        await runCtypeCommand(`login -t ${API_KEY}`);

        // 2. ctype use (PROJECT_NAME)
        await runCtypeCommand(`use ${PROJECT_NAME}`);

        // 3. ctype apply
        if (SHOULD_APPLY) {
            console.log(`\n[정보] SHOULD_APPLY가 true로 설정되어 배포를 진행합니다.`);
            console.log(`[정보] 배포를 위해 ${APP_YAML_PATH} 파일을 사용합니다.`);
            await runCtypeCommand('apply');
        } else {
            console.log("\n[정보] SHOULD_APPLY가 false이므로 배포를 건너뜁니다.");
        }

        console.log("\n✨ 배포 과정 전체가 성공적으로 완료되었습니다. ✨");

    } catch (error) {
        console.error("\n💥 배포 과정 중 오류가 발생하여 중단되었습니다. 💥");
        process.exit(1);
    }
}

// 스크립트 실행
main();
