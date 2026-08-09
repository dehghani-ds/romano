import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-footer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <footer class="footer">
      <div class="container footer__inner">
        <p class="footer__note">رومانو — قهوهٔ فردا، همین امروز.</p>

        <!-- The ای‌نماد seal is markup ای‌نماد supplies verbatim: the crawler
             matches the id/Code pair and the code attribute on the image, so
             none of it may be rewritten. It pairs with the enamad meta tag in
             index.html. aria-label is ours — the seal ships with an empty alt,
             which would leave the link with no accessible name. -->
        <a
          referrerpolicy="origin"
          target="_blank"
          href="https://trustseal.enamad.ir/?id=771562&amp;Code=teDrwGH175u939YqO8kHhOU4qzdZwgKu"
          class="footer__seal"
          aria-label="نماد اعتماد الکترونیکی"
        >
          <img
            referrerpolicy="origin"
            src="https://trustseal.enamad.ir/logo.aspx?id=771562&amp;Code=teDrwGH175u939YqO8kHhOU4qzdZwgKu"
            alt=""
            style="cursor:pointer"
            code="teDrwGH175u939YqO8kHhOU4qzdZwgKu"
          />
        </a>
      </div>
    </footer>
  `,
  styles: `
    .footer {
      position: relative;
      z-index: 1;
      margin-top: var(--space-3xl);
      border-top: 1px solid var(--c-border);
      background: color-mix(in srgb, var(--c-bg) 88%, transparent);
    }

    .footer__inner {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-md);
      padding-block: var(--space-lg);
    }

    .footer__note {
      margin: 0;
      font-size: var(--fs-sm);
      color: var(--c-fg-muted);
    }

    .footer__seal {
      display: inline-flex;
      border-radius: var(--radius-md);

      img {
        display: block;
        max-width: 100%;
        height: auto;
      }
    }
  `,
})
export class Footer {}
