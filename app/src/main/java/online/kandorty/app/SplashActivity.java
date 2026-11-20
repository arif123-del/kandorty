package online.kandorty.app;

import android.animation.ValueAnimator;
import android.app.Activity;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;
import android.os.Bundle;
import android.view.View;
import android.view.animation.DecelerateInterpolator;

public class SplashActivity extends Activity {

    private DotSplashView splashView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(0xFFFFFFFF);
        getWindow().setNavigationBarColor(0xFFFFFFFF);
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);

        splashView = new DotSplashView();
        setContentView(splashView);
        splashView.post(splashView::startAnimation);
    }

    private void openMain() {
        startActivity(new Intent(this, MainActivity.class));
        overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out);
        finish();
    }

    private class DotSplashView extends View {
        private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint redPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint subtitlePaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Bitmap logo;
        private float progress = 0f;
        private boolean started = false;

        DotSplashView() {
            super(SplashActivity.this);
            setBackgroundColor(0xFFFFFFFF);
            logo = BitmapFactory.decodeResource(getResources(), R.drawable.kandorty_logo_nodot);
            redPaint.setColor(0xFFED001B);
            subtitlePaint.setColor(0xFF211B1D);
            subtitlePaint.setTextAlign(Paint.Align.CENTER);
            subtitlePaint.setTypeface(android.graphics.Typeface.create("sans-serif", android.graphics.Typeface.NORMAL));
        }

        void startAnimation() {
            if (started) return;
            started = true;

            // The logo is always stationary. Only the red dot moves and shrinks.
            ValueAnimator animator = ValueAnimator.ofFloat(0f, 1f);
            animator.setStartDelay(180);
            animator.setDuration(1250);
            animator.setInterpolator(new DecelerateInterpolator(1.65f));
            animator.addUpdateListener(a -> {
                progress = (float) a.getAnimatedValue();
                invalidate();
            });
            animator.addListener(new android.animation.AnimatorListenerAdapter() {
                @Override
                public void onAnimationEnd(android.animation.Animator animation) {
                    postDelayed(SplashActivity.this::openMain, 260);
                }
            });
            animator.start();
        }

        private float lerp(float a, float b, float t) {
            return a + (b - a) * t;
        }

        @Override
        protected void onDraw(Canvas canvas) {
            super.onDraw(canvas);
            final float w = getWidth();
            final float h = getHeight();
            if (w <= 0 || h <= 0 || logo == null) return;

            // Static logo: centered and fixed for every frame.
            float logoW = w * 0.84f;
            float logoH = logoW * logo.getHeight() / (float) logo.getWidth();
            float logoLeft = (w - logoW) / 2f;
            float logoTop = h * 0.44f - logoH / 2f;
            RectF logoDst = new RectF(logoLeft, logoTop, logoLeft + logoW, logoTop + logoH);
            canvas.drawBitmap(logo, null, logoDst, paint);

            // Arabic subtitle only; no English text.
            subtitlePaint.setTextSize(Math.max(16f * getResources().getDisplayMetrics().scaledDensity, w * 0.042f));
            canvas.drawText("لوحة الإدارة", w / 2f,
                    logoTop + logoH + h * 0.065f, subtitlePaint);

            // Target is the original red-dot location in the Kandorty logo image.
            float targetX = logoLeft + logoW * (1138f / 1451f);
            float targetY = logoTop + logoH * (158f / 287f);
            float finalRadius = logoW * (60f / 1451f);

            // Start very large (roughly half-screen diameter), then curve toward the logo.
            float startX = w * 0.50f;
            float startY = h * 0.50f;
            float startRadius = Math.min(w * 0.28f, h * 0.17f);

            // Quadratic Bezier arc. Logo never moves.
            float controlX = w * 0.58f;
            float controlY = h * 0.44f;
            float t = progress;
            float inv = 1f - t;
            float dotX = inv * inv * startX + 2f * inv * t * controlX + t * t * targetX;
            float dotY = inv * inv * startY + 2f * inv * t * controlY + t * t * targetY;

            // Shrink smoothly from huge to the exact logo-dot size.
            float shrinkT = (float) Math.pow(t, 0.72);
            float radius = lerp(startRadius, finalRadius, shrinkT);

            canvas.drawCircle(dotX, dotY, radius, redPaint);
        }
    }
}
