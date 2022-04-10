import { RequestParameter } from "./types/RequestParameter";
import { RequestSearchParameter } from "./types/RequestSearchParameter";
import axios from "axios";
import WebSocket = require("ws");
import { Comment } from "./types/Comment";
import { WebsocketResult } from "./types/WebsocketResult";
import FormData from 'form-data';

export const API_DOMAIN = "qcs.shsbs.xyz";

const SUBPAGES_PER_PAGE = 25;
const COMMENTS_PER_PAGE = 25;

export const GetSearchBackDate = function (
  hours?: number,
  date?: Date
): string {
  hours = hours || 0;
  const back = date || new Date();
  back.setHours(back.getHours() - hours);
  return back.toISOString().substring(0, 13);
};

function RawWebSocket(token: string, lastId?: number): WebSocket
{
    const endpoint = `wss://${API_DOMAIN}/api/live/ws`;
    var params = new URLSearchParams();
    params.set("token", token)
    if(lastId) params.set("lastId", lastId.toString());
    var wsurl = endpoint + "?" + params.toString();
    var result = new WebSocket(wsurl);
    console.debug("Opened API websocket at endpoint: " + endpoint);
    return result;
};

export const BasicPageDisplaySearch = function (
  id: number,
  subpagePage = 0,
  commentPage = 0,
  subpagesPerPage: number = SUBPAGES_PER_PAGE,
  commentsPerPage: number = COMMENTS_PER_PAGE
): RequestParameter {
  const search = new RequestParameter(
    {
      pageid: id,
      filetype: 3,
    },
    [
      new RequestSearchParameter("content", "*", "id = @pageid"),
      //Subpages: we want most fields, but not SOME big/expensive fields. Hence ~
      // new RequestSearchParameter(
      //   "content",
      //   "~values,keywords,votes",
      //   "parentId = @pageid and !notdeleted() and contentType <> @filetype",
      //   "contentType,literalType,name",
      //   subpagesPerPage,
      //   subpagesPerPage * subpagePage,
      //   "subpages"
      // ),
      new RequestSearchParameter(
        "message",
        "*",
        "contentId = @pageid and !notdeleted() and !null(module)",
        "id_desc",
        commentsPerPage,
        commentsPerPage * commentPage
      ),
      // We grab your personal watches/votes/etc specifically for the main page to see if you ARE watching it
      // new RequestSearchParameter("watch", "*", "contentId = @pageid"), //This is YOUR watch (the requester)
      // new RequestSearchParameter("vote", "*", "contentId = @pageid"), //This is YOUR vote (the requester)
      // And then users in everything
      new RequestSearchParameter(
        "user",
        "*",
        "id in @message.createUserId or id in @content.createUserId"
      ),
    ]
  );

  return search;
};

export class QCS {
  private token: string;
  private _id: number;

  constructor(token: string) {
    this.token = token;
    this._id = -1;
  }
  public static async login(username: string, password: string): Promise<QCS> {
    const body = JSON.stringify({ username, password })
    const res = await axios.post(`https://${API_DOMAIN}/api/User/login`, body, {
        headers: {
            'Content-Type': 'application/json'
        }
    })
    const token = res.data as string;
    return new QCS(token);
  }

  public async getId(): Promise<number> {
    const res = await axios.get(`https://${API_DOMAIN}/api/status/token`, {
        headers: {
            'Authorization': `Bearer ${this.token}`,
            'Content-Type': 'application/json'
        }
    })
    const id = res.data.userId;
    return id;
  }

  // this will also edit comments if you add an id
  public async writeComment(comment: Partial<Comment>): Promise<Comment> {
    const res = await axios.post(`https://${API_DOMAIN}/api/Write/message`, JSON.stringify(comment), {
        headers: {
            'Authorization': `Bearer ${this.token}`,
            'Content-Type': 'application/json'
        }
    })
    return res.data;
  }

  public async deleteComment(id :number) {
    await axios.post(`https://${API_DOMAIN}/api/Delete/message/${id}`, '', {
        headers: {
            'Authorization': `Bearer ${this.token}`,
            'Content-Type': 'text/plain'
        }
    })
  }

  public createSocket(callback: (data: WebsocketResult) => void): WebSocket {
    const ws = RawWebSocket(this.token);
    ws.on('message', (event) => {
      try {
        const data = JSON.parse(event.toString()) as WebsocketResult;
        callback(data);
      } catch (e) {
        console.error(e);
      }
    });
    return ws;
  }

  public async uploadFile(data: FormData, bucket?: string): Promise<string> {
    if (bucket) {
      data.append("globalPerms", ".");
      data.append("values[bucket]", bucket);
    }
    const headers = {
      Authorization: `Bearer ${this.token}`,
      'Content-Type': 'multipart/form-data',
      ...data.getHeaders()
    };
    const res = await axios.post(`https://${API_DOMAIN}/api/File`, data, {
      headers
    });
    const hash = res.data.hash;
    return hash;
  }
}