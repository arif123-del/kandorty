# Kandorty iOS starter (not App Store release)

This SwiftUI + WKWebView prototype opens https://kandorty.online/ and adds native navigation, share and offline recovery. It does not include the admin app, live payment keys or signing certificates.

## Mac setup
1. Install current Xcode and XcodeGen (`brew install xcodegen`).
2. From this directory run `xcodegen generate`.
3. Open `Kandorty.xcodeproj` in Xcode and run on iPhone Simulator.
4. For physical iPhone/TestFlight: configure your Apple Developer team, unique bundle ID, signing and actual Kandorty app icon.

## Before App Store submission
- Verify whether Kandorty legally qualifies as an Apple organization; a trading name or D-U-N-S alone does not establish eligibility. Apple may require Individual enrollment.
- Test Google/Firebase sign-in, cart persistence, Stripe/3D Secure completion, order tracking, COD, photo gestures and file upload on a physical iPhone.
- Provide privacy policy and account deletion path if user account registration exists.
- Add native features beyond web clipping to meet Apple guideline 4.2.
- No Apple Developer membership, signing, TestFlight upload or App Store submission has been completed here.
