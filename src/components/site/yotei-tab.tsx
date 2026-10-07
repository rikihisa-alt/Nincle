import { router } from "expo-router";
import { useState } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";

import { DatePickerModal } from "@/components/calendar";
import {
  Avatar,
  BigButton,
  Card,
  Chip,
  EmptyState,
  Icon,
  Icons,
  LoadingView,
  SectionLabel,
  T,
  Tanzaku,
  dueColor,
  type IconName,
  FitText,
} from "@/components/ui";
import { MinTap, Space, useColors } from "@/constants/theme";
import type { RequestWithReplies, SiteDetail } from "@/data/api";
import { api } from "@/data/client";
import { useAction, useAssignments, useRequests } from "@/data/queries";
import { confirm } from "@/lib/confirm";
import {
  addDays,
  daysBetween,
  dueState,
  formatRange,
  formatShortDow,
  formatStamp,
  relativeDay,
  todayJst,
} from "@/lib/date";
import type { Answer } from "@/lib/types";
import { useMe } from "@/providers/auth";

export const ANSWER_LABEL: Record<Answer, string> = {
  yes: "入れる",
  no: "入れん",
  unknown: "まだわからん",
};
/** ボタン用の短い言葉（折り返さない長さ） */
export const ANSWER_BUTTON: Record<Answer, string> = {
  yes: "入れる",
  no: "入れん",
  unknown: "わからん",
};

export function AnswerChip({ answer }: { answer?: Answer }) {
  const c = useColors();
  if (answer === "yes")
    return <Chip label="入れる" icon={Icons.check} fg={c.ok} bg={c.okBg} />;
  if (answer === "no")
    return (
      <Chip
        label="入れん"
        icon={Icons.cross}
        fg={c.statusOver}
        bg={c.statusOverBg}
      />
    );
  if (answer === "unknown")
    return (
      <Chip
        label="まだわからん"
        icon={Icons.question}
        fg={c.statusSoon}
        bg={c.statusSoonBg}
      />
    );
  return <Chip label="未回答" fg={c.textSub} bg={c.cardAlt} />;
}

export function YoteiTab({ detail }: { detail: SiteDetail }) {
  const c = useColors();
  const { site, members, myRole } = detail;
  const isAdmin = myRole === "admin";
  const today = todayJst();
  const requests = useRequests(site.id);
  const upcoming = useAssignments({
    from: today,
    to: addDays(today, 45),
    siteIds: [site.id],
  });
  const { run } = useAction();
  const [showAllClosed, setShowAllClosed] = useState(false);
  const nameOf = (uid: string) =>
    members.find((m) => m.user_id === uid)?.user?.display_name ?? "退会した人";

  const open = (requests.data ?? []).filter((r) => r.status === "open");
  const closed = (requests.data ?? []).filter((r) => r.status === "closed");
  const byDate = new Map<string, { id: string; user_id: string }[]>();
  for (const a of upcoming.data ?? []) {
    const list = byDate.get(a.work_date) ?? [];
    list.push({ id: a.id, user_id: a.user_id });
    byDate.set(a.work_date, list);
  }

  const removeAssignment = async (
    assignmentId: string,
    uid: string,
    date: string,
  ) => {
    if (
      !(await confirm(
        "予定から外す",
        `${formatShortDow(date)}の予定から${nameOf(uid)}さんを外します。`,
        "外す",
      ))
    )
      return;
    await run(
      () => api.deleteAssignment(assignmentId),
      `${nameOf(uid)}さんを外しました`,
    );
  };

  return (
    <>
      <StatusBanner detail={detail} />

      <Card style={styles.info}>
        {site.address ? (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`住所 ${site.address}。地図を開く`}
            onPress={() =>
              Linking.openURL(
                `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(site.address!)}`,
              )
            }
            style={styles.infoRow}
          >
            <Icon name={Icons.pin} size={22} color={c.text} />
            <T style={[styles.infoText, styles.flex]}>{site.address}</T>
            <T style={[styles.mapLink, { color: c.info }]}>地図</T>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            router.push({
              pathname: "/site/[id]/settings",
              params: { id: site.id },
            })
          }
          style={styles.infoRow}
        >
          <Icon name={Icons.people} size={22} color={c.text} />
          <T style={[styles.infoText, styles.flex]} numberOfLines={2}>
            {members.map((m) => m.user?.display_name ?? "").join("・")}（
            {members.length}人）
          </T>
          <Icon name={Icons.chevron} size={20} color={c.textSub} />
        </Pressable>
        {site.memo ? (
          <View style={[styles.memo, { backgroundColor: c.cardAlt }]}>
            <T style={styles.memoText}>{site.memo}</T>
          </View>
        ) : null}
      </Card>

      {isAdmin && site.status !== "archived" && (
        <View style={styles.adminActions}>
          <BigButton
            label="入れるか聞く"
            icon={Icons.add}
            compact
            onPress={() =>
              router.push({
                pathname: "/site/[id]/request",
                params: { id: site.id },
              })
            }
            accessibilityHint="メンバーに、入れるかどうかを聞きます"
            style={styles.flex}
          />
          <BigButton
            label="予定を入れる"
            kind="secondary"
            icon={Icons.calendar}
            compact
            onPress={() =>
              router.push({
                pathname: "/site/[id]/assign",
                params: { id: site.id },
              })
            }
            accessibilityHint="聞かずに、決まった予定を入れます"
            style={styles.flex}
          />
        </View>
      )}

      <SectionLabel>{`確認中（${open.length}件）`}</SectionLabel>
      {requests.isLoading ? (
        <LoadingView />
      ) : open.length === 0 ? (
        <T tone="textSub" style={styles.none}>
          いま確認中の予定はありません
        </T>
      ) : (
        <View style={styles.gap}>
          {open.map((r) => (
            <RequestCard key={r.id} request={r} detail={detail} />
          ))}
        </View>
      )}

      <SectionLabel>これからの予定（決まったもの）</SectionLabel>
      {upcoming.isLoading ? (
        <LoadingView />
      ) : byDate.size === 0 ? (
        <EmptyState
          title="決まった予定はまだありません"
          body={
            isAdmin
              ? "「予定の確認を出す」で、入れる人を聞いてから決められます。"
              : undefined
          }
        />
      ) : (
        <Card>
          {[...byDate.entries()].map(([date, list], i) => (
            <View
              key={date}
              style={[
                styles.dateRow,
                i > 0 && { borderTopWidth: 1, borderTopColor: c.border },
              ]}
            >
              <T style={styles.dateLabel}>{relativeDay(date, today)}</T>
              <View style={styles.names}>
                {list.map((a) => (
                  <View
                    key={a.id}
                    style={[
                      styles.nameChip,
                      { borderColor: c.border, backgroundColor: c.cardAlt },
                    ]}
                  >
                    <T style={styles.nameText}>{nameOf(a.user_id)}</T>
                    {isAdmin && site.status !== "archived" && (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`${nameOf(a.user_id)}さんを${formatShortDow(date)}の予定から外す`}
                        onPress={() => removeAssignment(a.id, a.user_id, date)}
                        style={styles.removeBtn}
                      >
                        <Icon name={Icons.close} size={18} color={c.textSub} />
                      </Pressable>
                    )}
                  </View>
                ))}
              </View>
            </View>
          ))}
        </Card>
      )}

      {closed.length > 0 && (
        <>
          <SectionLabel>{`終わった確認（${closed.length}件）`}</SectionLabel>
          <View style={styles.gap}>
            {(showAllClosed ? closed : closed.slice(0, 2)).map((r) => (
              <RequestCard key={r.id} request={r} detail={detail} />
            ))}
          </View>
          {closed.length > 2 && !showAllClosed && (
            <BigButton
              label={`残り${closed.length - 2}件も見る`}
              kind="ghost"
              compact
              onPress={() => setShowAllClosed(true)}
              style={styles.mt}
            />
          )}
        </>
      )}
    </>
  );
}

/** 納期・状態のお知らせと、その場でできる操作 */
function StatusBanner({ detail }: { detail: SiteDetail }) {
  const c = useColors();
  const { site, myRole } = detail;
  const isAdmin = myRole === "admin";
  const today = todayJst();
  const { run, busy } = useAction();
  const [picking, setPicking] = useState(false);
  const state = dueState(today, site.due_date);
  const left = daysBetween(today, site.due_date);

  const setStatus = async (
    status: "active" | "completed" | "archived",
    message: string,
    ask?: [string, string, string],
  ) => {
    if (ask && !(await confirm(...ask))) return;
    await run(() => api.updateSite(site.id, { status }), message);
  };

  if (site.status === "archived") {
    return (
      <Banner
        fg={c.textSub}
        bg={c.cardAlt}
        icon={Icons.archive}
        text="アーカイブした現場です。やりとり・出面・集計は見るだけできます。"
      >
        {isAdmin && (
          <BigButton
            label="再開する"
            kind="secondary"
            busy={busy}
            onPress={() => setStatus("active", "現場を再開しました")}
          />
        )}
      </Banner>
    );
  }
  if (site.status === "completed") {
    return (
      <Banner
        fg={c.ok}
        bg={c.okBg}
        icon={Icons.check}
        text="完了した現場です（精算待ち）。精算が済んだらアーカイブしてください。"
      >
        {isAdmin && (
          <View style={styles.bannerBtns}>
            <BigButton
              label="アーカイブする"
              kind="secondary"
              busy={busy}
              onPress={() =>
                setStatus("archived", "アーカイブしました", [
                  "アーカイブする",
                  "一覧から外して、見るだけにします。あとで再開もできます。",
                  "アーカイブ",
                ])
              }
              style={styles.flex}
            />
            <BigButton
              label="作業を再開"
              kind="ghost"
              busy={busy}
              onPress={() => setStatus("active", "進行中に戻しました")}
              style={styles.flex}
            />
          </View>
        )}
      </Banner>
    );
  }
  if (!isAdmin || state === "active") return null;
  const { fg, bg } = dueColor(c, state);
  return (
    <Banner
      fg={fg}
      bg={bg}
      icon={Icons.warning}
      text={
        state === "over"
          ? `納期を${-left}日過ぎています。延ばすか完了にするか決めてください`
          : left === 0
            ? "今日が納期です。延ばすか完了にするか決めてください"
            : `納期まで${left}日です。`
      }
    >
      <View style={styles.bannerBtns}>
        <BigButton
          label="納期を延ばす"
          kind="secondary"
          onPress={() => setPicking(true)}
          style={styles.flex}
        />
        <BigButton
          label="完了にする"
          kind="secondary"
          busy={busy}
          onPress={() =>
            setStatus("completed", "完了にしました", [
              "完了にする",
              "現場を「完了（精算待ち）」にします。出面の入力と集計はそのままできます。",
              "完了にする",
            ])
          }
          style={styles.flex}
        />
      </View>
      <DatePickerModal
        visible={picking}
        title="新しい納期"
        initial={site.due_date > today ? site.due_date : addDays(today, 7)}
        min={today}
        onClose={() => setPicking(false)}
        onPick={(d) => {
          setPicking(false);
          void run(
            () => api.updateSite(site.id, { due_date: d }),
            `納期を${formatShortDow(d)}に延ばしました`,
          );
        }}
      />
    </Banner>
  );
}

function Banner({
  fg,
  bg,
  icon,
  text,
  children,
}: {
  fg: string;
  bg: string;
  icon: IconName;
  text: string;
  children?: React.ReactNode;
}) {
  return (
    <View
      style={[styles.banner, { backgroundColor: bg, borderColor: fg }]}
      accessibilityRole="summary"
    >
      <View style={styles.row}>
        <Icon name={icon} size={24} color={fg} />
        <T style={[styles.bannerText, { color: fg }]}>{text}</T>
      </View>
      {children}
    </View>
  );
}

export function RequestCard({
  request,
  detail,
}: {
  request: RequestWithReplies;
  detail: SiteDetail;
}) {
  const c = useColors();
  const { userId } = useMe();
  const { run, busy } = useAction();
  const { members, myRole, site } = detail;
  const isAdmin = myRole === "admin";
  const isOpen = request.status === "open";
  const answerOf = (uid: string) =>
    request.replies.find((r) => r.user_id === uid)?.answer;
  const myAnswer = answerOf(userId);
  const amMember = members.some((m) => m.user_id === userId);
  const unanswered = members.filter(
    (m) => !answerOf(m.user_id) && m.user_id !== userId,
  );
  const counts = { yes: 0, no: 0, unknown: 0 } as Record<Answer, number>;
  request.replies.forEach((r) => counts[r.answer]++);
  const author =
    members.find((m) => m.user_id === request.created_by)?.user?.display_name ??
    "管理者";
  const [showReplies, setShowReplies] = useState(isAdmin);

  return (
    <Tanzaku stripe={isOpen ? c.accent : c.border}>
      <View style={styles.rowBetween}>
        <FitText style={styles.reqDate} boxStyle={styles.flex}>
          {formatRange(request.target_date_from, request.target_date_to)}
        </FitText>
        {!isOpen && (
          <Chip
            label={request.confirmed_at ? "決定済み" : "締め切り"}
            icon={Icons.lock}
            fg={c.textSub}
            bg={c.cardAlt}
          />
        )}
      </View>
      {request.meet_time && (
        <T style={styles.reqTime}>{request.meet_time} 集合</T>
      )}
      {request.note && <T style={styles.body}>{request.note}</T>}
      <T tone="textSub" style={styles.meta}>
        {author}さん　{formatStamp(request.created_at)}
      </T>

      {isOpen && amMember && site.status !== "archived" && (
        <View style={styles.answerBox}>
          <T style={styles.answerLabel}>
            {myAnswer
              ? "あなたの返事（押すと変えられます）"
              : "あなたは入れますか？"}
          </T>
          <View style={styles.row}>
            {(["yes", "no", "unknown"] as const).map((a) => (
              <BigButton
                key={a}
                label={ANSWER_BUTTON[a]}
                icon={
                  a === "yes"
                    ? Icons.check
                    : a === "no"
                      ? Icons.cross
                      : Icons.question
                }
                kind="secondary"
                selected={myAnswer === a}
                disabled={busy}
                onPress={() =>
                  run(
                    () => api.reply(request.id, userId, a),
                    `「${ANSWER_LABEL[a]}」と返事しました`,
                  )
                }
                style={styles.answerBtn}
              />
            ))}
          </View>
        </View>
      )}

      <View style={styles.rowBetween}>
        <T style={styles.answerLabel}>返事の状況</T>
        <T style={styles.count}>
          {request.replies.length}／{members.length}人
        </T>
      </View>
      <T tone="textSub" style={styles.meta}>
        入れる {counts.yes}・入れん {counts.no}・まだ {counts.unknown}・未回答{" "}
        {members.length - request.replies.length}
      </T>
      {!showReplies ? (
        <BigButton
          label="みんなの返事を見る"
          kind="ghost"
          compact
          onPress={() => setShowReplies(true)}
        />
      ) : (
        <View style={[styles.replyList, { borderColor: c.border }]}>
          {members.map((m, i) => (
            <View
              key={m.user_id}
              style={[
                styles.replyRow,
                i > 0 && { borderTopWidth: 1, borderTopColor: c.border },
              ]}
            >
              <Avatar name={m.user?.display_name ?? "？"} size={34} />
              <T style={[styles.memberName, styles.flex]}>
                {m.user?.display_name}
                <T tone="textSub" style={styles.trade}>
                  {m.user?.trade ? `（${m.user.trade}）` : ""}
                </T>
              </T>
              <AnswerChip answer={answerOf(m.user_id)} />
            </View>
          ))}
        </View>
      )}

      {isAdmin && isOpen && (
        <View style={styles.gap}>
          {unanswered.length > 0 && (
            <BigButton
              label={`未回答の${unanswered.length}人につつく`}
              icon={Icons.bell}
              kind="secondary"
              busy={busy}
              onPress={() =>
                run(
                  () => api.nudge(request.id),
                  (n) => `${n}人に通知を送りました`,
                )
              }
            />
          )}
          <BigButton
            label="入る人を決める"
            icon={Icons.check}
            onPress={() =>
              router.push({
                pathname: "/site/[id]/confirm/[requestId]",
                params: { id: site.id, requestId: request.id },
              })
            }
            accessibilityHint="決めた人のカレンダーに予定が入り、通知が届きます"
          />
          <BigButton
            label="決めずに締め切る"
            kind="ghost"
            compact
            onPress={async () => {
              if (
                await confirm(
                  "締め切る",
                  "この確認を締め切ります。予定は入りません。",
                  "締め切る",
                )
              ) {
                await run(() => api.closeRequest(request.id), "締め切りました");
              }
            }}
          />
        </View>
      )}
    </Tanzaku>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: Space.s },
  mt: { marginTop: Space.s },
  row: { flexDirection: "row", alignItems: "center", gap: Space.s },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Space.s,
    flexWrap: "wrap",
  },
  info: { marginTop: Space.l },
  infoRow: {
    minHeight: MinTap,
    flexDirection: "row",
    alignItems: "center",
    gap: Space.s,
    paddingHorizontal: Space.l,
    paddingVertical: Space.s,
  },
  infoText: { fontSize: 16, fontWeight: "700" },
  mapLink: { fontSize: 15, fontWeight: "800", textDecorationLine: "underline" },
  memo: { margin: Space.m, marginTop: 0, padding: Space.m, borderRadius: 6 },
  memoText: { fontSize: 15, fontWeight: "600", lineHeight: 22 },
  adminActions: { flexDirection: "row", gap: Space.s, marginTop: Space.m },
  none: { fontSize: 16, fontWeight: "700" },
  dateRow: {
    paddingHorizontal: Space.l,
    paddingVertical: Space.m,
    gap: Space.s,
  },
  dateLabel: { fontSize: 17, fontWeight: "900" },
  names: { flexDirection: "row", flexWrap: "wrap", gap: Space.s },
  nameChip: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 8,
    paddingLeft: Space.m,
    minHeight: 44,
  },
  nameText: { fontSize: 16, fontWeight: "800", paddingRight: Space.m },
  removeBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: -Space.s,
  },
  banner: {
    marginTop: Space.l,
    borderWidth: 2,
    borderRadius: 8,
    padding: Space.m,
    gap: Space.m,
  },
  bannerText: { flex: 1, fontSize: 16, fontWeight: "800", lineHeight: 23 },
  bannerBtns: { flexDirection: "row", gap: Space.s },
  reqDate: { fontSize: 22, fontWeight: "900" },
  reqTime: { fontSize: 18, fontWeight: "800" },
  body: { fontSize: 16, lineHeight: 24 },
  meta: { fontSize: 14, fontWeight: "600" },
  answerBox: { gap: Space.s, marginTop: Space.xs },
  answerLabel: { fontSize: 16, fontWeight: "800" },
  answerBtn: {
    flex: 1,
    flexDirection: "column",
    paddingHorizontal: 4,
    paddingVertical: 6,
    gap: 2,
    minHeight: 68,
  },
  count: { fontSize: 18, fontWeight: "900" },
  replyList: { borderWidth: 1, borderRadius: 8 },
  replyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.s,
    paddingHorizontal: Space.m,
    minHeight: MinTap,
  },
  memberName: { fontSize: 17, fontWeight: "800" },
  trade: { fontSize: 14, fontWeight: "600" },
});
