# Windows EXE 빌드 가이드

다음 가이드는 이 리포지토리(`server.js` 기반 Express + WebSocket 앱)를 Windows용 단일 실행파일(EXE)로 패키징하는 방법을 설명합니다. 주요 도구는 `pkg`입니다.

## 전제 조건
- Node.js 및 npm이 설치되어 있어야 합니다.
- 프로젝트 루트에서 작업합니다 (`d:\workspaces\p2pmsg`).

## 1) 의존성 설치

```powershell
npm install
```

## 2) 권장 패키지/설정
- `pkg` 사용: 로컬 devDependency로 설치하거나 `npx pkg`를 사용합니다.
- 이 프로젝트의 `package.json`에는 이미 `build:exe` 스크립트와 `pkg.assets` 설정이 포함되어 있습니다. (엔트리 포인트가 `server.js`로 설정되어 있어야 함)

필요시 로컬 설치:

```powershell
npm install -D pkg
```

또는 전역 설치:

```powershell
npm i -g pkg
```

## 3) ESM/CJS 호환성 (중요)
`pkg`로 패키징할 때, 일부 패키지는 ESM 전용으로 배포되어 런타임에서 `SyntaxError: Unexpected token 'export'` 같은 오류가 발생할 수 있습니다. 예: `uuid@13`는 ESM 전용일 수 있습니다. 이 레포에서는 `uuid`를 `^8.3.2` 같이 CommonJS 호환 버전으로 고정해야 합니다.

## 4) 업로드(파일 쓰기) 관련 주의사항
- `pkg`로 만든 EXE는 소스 파일을 읽기 전용 스냅샷 내부에 포함합니다. 따라서 애플리케이션이 스냅샷 내부(예: `__dirname` 기준) 경로에 파일을 쓰려고 하면 실패합니다.
- 해결: `server.js`는 업로드와 정적 제공을 런타임에서 쓰기 가능한 외부 디렉터리(예: `process.cwd()/uploads`)로 통일하도록 수정되어야 합니다. (이미 해당 변경이 적용되어 있음)

## 5) 빌드 명령

직접 `pkg` 사용:

```powershell
npx pkg . --targets node18-win-x64 --output dist/p2pmsg.exe
```

`package.json`에 `build:exe` 스크립트가 있는 경우:

```powershell
npm run build:exe
```

빌드가 완료되면 `dist/p2pmsg.exe`(또는 지정한 출력 파일)가 생성됩니다.

## 6) EXE 실행 및 확인

```powershell
# 콘솔에서 실행
.\dist\p2pmsg.exe

# 또는 백그라운드로 실행
Start-Process -FilePath .\dist\p2pmsg.exe
```

브라우저에서 `http://localhost:3000` 접속으로 정적 페이지가 보이는지 확인합니다. 파일 업로드(클라이언트 UI 또는 curl/curl.exe) 시 서버가 `200 OK`를 반환하는지 확인하세요.

예시 업로드 (Windows PowerShell에서 curl.exe 사용 권장):

```powershell
curl.exe -i -F "file=@testfile.txt" -F "roomId=<roomId>" -F "senderId=<senderId>" http://localhost:3000/upload
```

## 7) 자주 발생하는 문제 및 해결
- SyntaxError: Unexpected token 'export' → ESM-only 패키지 사용 문제: 해당 패키지를 CommonJS 버전으로 교체 또는 적절한 버전으로 고정.
- 업로드가 400 Bad Request이면서 파일만 디스크에 남음 → 멀터는 요청 처리 중 먼저 파일을 디스크에 씁니다. 요청 검증에서 거부하면 고아 파일이 남을 수 있으니, 검증 실패 시 업로드된 파일을 삭제하거나 `memoryStorage`를 사용해 검증 후 디스크로 이동하는 패턴을 적용하세요.
- 정적 파일이 보이지 않음 → 정적 제공 경로가 스냅샷 내부를 가리키고 있을 수 있습니다. 정적 파일(클라이언트)은 `pkg`의 `assets` 옵션에 포함되어야 하며, 정적 파일을 외부 폴더로 복사해 제공하거나 `express.static`이 올바른 런타임 경로를 가리키는지 확인하세요.

## 8) 배포/인스톨러 옵션 (선택사항)
- EXE를 Inno Setup 같은 도구로 감싸 설치 프로그램을 만들 수 있습니다. 설치 시 `uploads` 같은 데이터 디렉터리를 생성하도록 스크립트에 추가하세요.

## 9) 재빌드 주의사항
- 코드(특히 `server.js`)를 변경한 뒤에는 EXE를 다시 빌드해야 변경사항이 반영됩니다.

---
문제가 계속되면 빌드 로그와 EXE 실행 시 표출되는 오류 로그를 붙여 보내 주시면 더 자세히 도와드리겠습니다.
