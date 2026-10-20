// The server only stores the file name, so the title the user types is used as
// the file name when uploading: "Cover drive" + "1000175661.mp4" -> "Cover drive.mp4".
// (The upload Lambda turns spaces and special characters into "_".)
export function uploadFileName(title: string, originalName: string) {
  const extension = originalName.match(/\.[A-Za-z0-9]+$/)?.[0] ?? '.mp4';
  return `${title.trim()}${extension}`;
}

// File name from the server -> text to show: "Cover_drive.mp4" -> "Cover drive"
export function videoTitle(fileName: string) {
  const title = fileName.replace(/\.[^.]+$/, '').replace(/_+/g, ' ').trim();
  return title || 'Untitled video';
}
