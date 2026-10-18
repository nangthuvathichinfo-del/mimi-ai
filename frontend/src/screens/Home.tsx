import { t } from "../i18n";
import { API_MODE } from "../lib/firebase";
import { Link } from "react-router-dom";
import { BookOpen, ClipboardList, Package, ScanLine, Settings } from "lucide-react";
import { useHome, useMe } from "../api/hooks";
import { MainFrame, TopBar } from "../components/AppShell";
import { formatVnd } from "../lib/text";

const LEARN_TARGET = 5;

/** Trang chủ sau đăng nhập (spec mục 2). `entering`: vừa mở link đăng nhập, bốn ô hiện dần. */
export function Home({ entering = false }: { entering?: boolean }) {
  const me = useMe();
  const home = useHome();
  const h = home.data;
  const receipts = me.data?.receipt_count ?? 0;
  const name = me.data?.display_name;

  // Không hiện số 0 giả: chưa có dữ liệu thì để trống dòng phụ.
  const tiles = [
    {
      to: "/spending",
      title: t.home.tiles.spending,
      Icon: BookOpen,
      meta: h?.spent_this_month != null ? (
        <>{t.home.spentThisMonth}<br /><b className="num">{formatVnd(h.spent_this_month)}</b></>
      ) : null,
    },
    {
      to: "/items",
      title: t.home.tiles.items,
      Icon: Package,
      meta: h && receipts > 0 ? (
        <><b className="num">{h.needs_count}</b> {t.home.runningLow(h.needs_count)}</>
      ) : null,
    },
    {
      to: "/plan",
      title: t.home.tiles.plan,
      Icon: ClipboardList,
      meta: h && h.plan.item_count > 0 ? (
        <>
          <b className="num">{h.plan.item_count}</b> {t.home.inCart(h.plan.item_count)}
          {h.plan.estimate != null && <><br />{t.home.estimate} <span className="num">{formatVnd(h.plan.estimate)}</span></>}
        </>
      ) : null,
    },
    { to: "/settings", title: t.home.tiles.settings, Icon: Settings, meta: null },
  ];

  return (
    <MainFrame>
      <TopBar brand />
      <div className="home">
        <div className="home__hello">
          <Link to="/today" className="bubble">
            {t.home.bubble}<small>{t.home.comingSoon}</small>
          </Link>
          <p className="home__greet">{t.home.greet(name)}</p>
          <p className="home__tagline">{t.home.tagline}</p>
        </div>

        <ul className={entering ? "tiles tiles--enter" : "tiles"}>
          {tiles.map(({ to, title, Icon, meta }) => (
            <li key={to}>
              <Link to={to} className="tile">
                <Icon className="tile__icon" size={26} strokeWidth={1.8} aria-hidden />
                <span className="tile__body">
                  <span className="tile__title">{title}</span>
                  <span className="tile__meta">{meta}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>

        {me.data && receipts < LEARN_TARGET && (
          <section className="learn" aria-label={t.home.learnLabel}>
            <strong>{t.home.learnTitle}</strong>
            <div className="learn__dots" aria-hidden>
              {Array.from({ length: LEARN_TARGET }, (_, i) => (
                <span key={i} className={i < receipts ? "on" : undefined} />
              ))}
            </div>
            <p>{t.home.learnBody(receipts, LEARN_TARGET)}</p>
          </section>
        )}

        <Link to="/scan" className="btn btn--primary btn--block btn--lg">
          <ScanLine size={24} aria-hidden /> {t.home.scan}
        </Link>
        <p className="home__foot">
          {t.home.footer}
          {API_MODE === "mock" && <span className="proto">{t.common.prototype}</span>}
        </p>
      </div>
    </MainFrame>
  );
}
