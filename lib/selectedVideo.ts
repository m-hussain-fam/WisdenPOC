export type SelectedVideo = {
  uri: string;
  thumb: string;
  videoName: string;
  contentType: string;
};

let selected: SelectedVideo | null = null;

export function setSelectedVideo(video: SelectedVideo) {
  selected = video;
}

export function getSelectedVideo() {
  return selected;
}
