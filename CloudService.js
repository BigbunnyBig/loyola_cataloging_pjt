const { spawn } = require('child_process');
const path = require('path');

// =========================================================
// 🔑 사용자 설정 변수 (Secrets 기반)
// =========================================================

/**
 * GitHub Actions에서 환경 변수로 전달된 API Key를 사용합니다.
 * (Settings → Secrets → Actions → New repository secret → CLOUDTYPE_API_KEY)
 */
const API_KEY = process.env.API_KEY;

/**
 * 배포할 CloudType 프로젝트 이름을 여기에 입력하세요.
 */
const PROJECT_NAME = 'loyola_pjt:main';

// 배포(ctype apply) 명령을 실행할지 여부
const SHOULD_APPLY = true;

// =========================================================
// 💡 내부 로직 (수정하지 마세요)
// =========================================================

const APP_YAML_PATH = path.join(__dirname, 'cloudtype', 'app.yaml');

function runCtypeCommand(command) {
    return new Promise((resolve, reject) => {
        const [subCommand, ...args] = command.split(' ').filter(a => a);
        const ctypeExecutable = process.platform === 'win32' ? 'ctype.cmd' : 'ctype';

        const child = spawn(ctypeExecutable, [subCommand, ...args], {
            stdio: 'pipe',
            shell: true
        });

        let output = '';
        child.stdout.on('data', (data) => {
            output += data.toString();
            process.stdout.write(data);
        });

        child.stderr.on('data', (data) => {
            process.stderr.write(data);
        });

        child.on('close', (code) => {
            if (code === 0) {
                resolve(output);
            } else {
                reject(new Error(`ctype ${subCommand} exited with code ${code}`));
            }
        });
    });
}

/**
 * 서비스 상태 확인 후 중지된 서비스 자동 시작
 */
async function checkAndStartServices() {
    console.log("\n▶ 서비스 상태 확인 중...");
    const statusOutput = await runCtypeCommand('status');

    const stoppedServices = [];
    const lines = statusOutput.split('\n');
    for (const line of lines) {
        if (line.includes('Stopped')) {
            const serviceName = line.split(/\s+/)[0]; // 첫 번째 컬럼이 서비스명이라고 가정
            stoppedServices.push(serviceName);
        }
    }

    if (stoppedServices.length > 0) {
        console.log(`\n❗ 중지된 서비스 발견: ${stoppedServices.join(', ')}`);
        for (const svc of stoppedServices) {
            console.log(`▶ ${svc} 서비스 시작 중...`);
            await runCtypeCommand(`start ${svc}`);
        }
    } else {
        console.log("\n✅ 모든 서비스가 실행 중입니다.");
    }
}

/**
 * 배포 스크립트의 메인 함수
 */
async function main() {
    if (!API_KEY || !PROJECT_NAME) {
        console.error("❌ 오류: API_KEY 또는 PROJECT_NAME 변수가 설정되지 않았습니다.");
        process.exit(1);
    }

    try {
        // 1. 로그인
        await runCtypeCommand(`login -t ${API_KEY}`);

        // 2. 프로젝트 선택
        await runCtypeCommand(`use ${PROJECT_NAME}`);

        // 3. 배포
        if (SHOULD_APPLY) {
            console.log(`\n[정보] 배포를 진행합니다. (${APP_YAML_PATH})`);
            await runCtypeCommand('apply');
        } else {
            console.log("\n[정보] SHOULD_APPLY가 false이므로 배포를 건너뜁니다.");
        }

        // 4. 앱 서비스 상태 확인 및 중지된 서비스 시작
        await checkAndStartServices();

        // 5. DB 서비스(postgresql) 강제 시작
        console.log("\n▶ PostgreSQL 서비스 확인 및 시작");
        try {
            await runCtypeCommand('start postgresql');
            console.log("✅ PostgreSQL 서비스가 시작되었습니다.");
        } catch (err) {
            console.error("❌ PostgreSQL 서비스 시작 실패:", err.message);
        }

        console.log("\n✨ 전체 과정이 성공적으로 완료되었습니다. ✨");

    } catch (error) {
        console.error("\n💥 오류 발생: 배포 또는 서비스 시작 실패 💥");
        process.exit(1);
    }
}

// 스크립트 실행
main();
