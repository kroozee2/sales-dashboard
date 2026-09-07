export type FathomPickerListState<Meeting> = {
  stage: "list";
  meetings: Meeting[];
  omitted: number;
  more_available: boolean;
};

export type FathomPickerPreviewState<Meeting, Extracted> = {
  stage: "preview";
  meeting: Meeting;
  extracted: Extracted;
  previousList: FathomPickerListState<Meeting>;
};

export function selectFathomMeetingForPreview<Meeting, Extracted>(
  previousList: FathomPickerListState<Meeting>,
  meeting: Meeting,
  extracted: Extracted,
): FathomPickerPreviewState<Meeting, Extracted> {
  return { stage: "preview", meeting, extracted, previousList };
}

export function activateFathomBack<Meeting, Extracted>(
  preview: FathomPickerPreviewState<Meeting, Extracted>,
): FathomPickerListState<Meeting> {
  return preview.previousList;
}

export function fathomPageDisclosure<Meeting>(state: FathomPickerListState<Meeting>): string {
  return [
    state.omitted > 0
      ? `${state.omitted} additional recording${state.omitted === 1 ? "" : "s"} from this page omitted.`
      : "",
    state.more_available ? "More recordings are available on later Fathom pages." : "",
  ].filter(Boolean).join(" ");
}

export function fathomAttendeeOmission(count: number): string {
  return count > 0 ? `${count} more external attendee${count === 1 ? "" : "s"} omitted` : "";
}

export type FathomAccessibleMeeting = {
  title: string;
  date: string | null;
  duration_min: number | null;
  attendees: string | null;
  attendees_omitted: number;
};

export function fathomRecordingTimeLabel(meeting: Pick<FathomAccessibleMeeting, "date" | "duration_min">): string {
  const date = meeting.date
    ? new Date(meeting.date).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : "Date unavailable";
  return `${date}${meeting.duration_min !== null ? ` · ${meeting.duration_min}m` : ""}`;
}

export function fathomRecordingAccessibleLabel(meeting: FathomAccessibleMeeting): string {
  return [
    meeting.title,
    fathomRecordingTimeLabel(meeting),
    meeting.attendees ?? "No external attendees",
    fathomAttendeeOmission(meeting.attendees_omitted),
  ].filter(Boolean).join(". ");
}
