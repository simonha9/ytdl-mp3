import fs from 'fs';
import os from 'os';
import path from 'path';

import NodeID3 from 'node-id3';
import ytdl from 'ytdl-core';
import type { videoInfo as VideoInfo } from 'ytdl-core';

import { FormatConverter } from './FormatConverter';
import { SongTagsSearch } from './SongTagsSearch';
import { YtdlMp3Error, isDirectory, removeParenthesizedText } from './utils';


export interface DownloaderOptions {
  outputDir?: string;
  getTags?: boolean;
  verifyTags?: boolean;
}

export class Downloader {
  static defaultDownloadsDir = path.join(os.homedir(), 'Downloads');
  static i = 0;

  outputDir: string;
  getTags: boolean;
  verifyTags: boolean;

  constructor({ outputDir, getTags, verifyTags }: DownloaderOptions) {
    this.outputDir = outputDir ?? Downloader.defaultDownloadsDir;
    this.getTags = Boolean(getTags);
    this.verifyTags = Boolean(verifyTags);
  }

  async downloadSong(url: string, title: string, artist: string): Promise<string> {
    if (!isDirectory(this.outputDir)) {
      throw new YtdlMp3Error(`Not a directory: ${this.outputDir}`);
    }
    const videoInfo = await ytdl.getInfo(url).catch((error) => {
      throw new YtdlMp3Error(`Failed to fetch info for video with URL: ${url}`, {
        cause: error,
      });
    });

    const videoTitle = `${title} - ${artist}`
    const formatConverter = new FormatConverter();
    const songTagsSearch = new SongTagsSearch(videoTitle);

    const outputFile = this.getOutputFile(videoTitle);
    // check if outputfile already exists
    if (fs.existsSync(outputFile)) {
      console.log(`File already exists: ${outputFile}`);
      return outputFile;
    }

    const videoData = await this.downloadVideo(videoInfo);

    formatConverter.videoToAudio(videoData, outputFile);
    if (this.getTags) {
      const songTags = await songTagsSearch.search(this.verifyTags);
      NodeID3.write(songTags, outputFile);
    }

    console.log(`Done! Output file: ${outputFile}`);
    return outputFile;
  }

  /** Returns the content from the video as a buffer */
  private async downloadVideo(videoInfo: VideoInfo): Promise<Buffer> {
    const buffers: Buffer[] = [];
    const stream = ytdl.downloadFromInfo(videoInfo, { quality: 'highestaudio' }); // .pipe(fs.createWriteStream(outputFile));
    return new Promise((resolve, reject) => {
      stream.on('data', (chunk: Buffer) => {
        buffers.push(chunk);
      });
      stream.on('end', () => {
        resolve(Buffer.concat(buffers));
      });
      stream.on('error', (err) => {
        reject(err);
      });
    });
  }

  /** Returns the absolute path to the audio file to be downloaded */
  private getOutputFile(videoTitle: string): string {
    let baseFileName = removeParenthesizedText(videoTitle)
      .replace(/[^a-z0-9]/gi, '_')
      .split('_')
      .filter((element) => element)
      .join('_')
      .toLowerCase();
    baseFileName = baseFileName.length > 0 ? baseFileName : 'untitled' + Downloader.i++;
    return path.join(this.outputDir, baseFileName + '.mp3');
  }
}
