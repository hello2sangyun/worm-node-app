# WORM Node — Mining Dashboard

맥용 노드 참여 (마이닝) 클라이언트

## 개발 서버 실행
```bash
npm install
npm run dev
# → http://localhost:1421
```

## Tauri 앱 빌드 (macOS .app)
```bash
npm run tauri dev      # 개발 빌드 (핫리로드)
npm run tauri build    # 프로덕션 .dmg 생성
```

## 기능
- **Dashboard**: 실시간 Activity Log + Reward Tracker
- **Storage & PoS**: Proof-of-Storage 챌린지 현황
- **Chain & Validators**: 블록 높이, 최근 블록, PoA 검증자 목록
- **Settings**: 노드 설정, 자동재연결, 릴레이/PoS 토글

## 서버
worm-protocol-production.up.railway.app
