package weixin

// ============ 消息项类型常量 ============

const (
	MessageItemTypeText   = 1
	MessageItemTypeVoice  = 2
	MessageItemTypeImage  = 3
	MessageItemTypeVideo  = 4
	MessageItemTypeFile   = 5
	MessageItemTypeRecall = 6
)

// ============ 消息类型常量 ============

const (
	MessageTypeUser       = 1
	MessageTypeBot        = 2
	MessageTypeSystem     = 3
)

// ============ 消息状态常量 ============

const (
	MessageStateSend     = 1
	MessageStateRecalled = 2
	MessageStateFinish   = 3
)

// ============ 上传媒体类型常量 ============

const (
	UploadMediaTypeImage = 1
	UploadMediaTypeVoice = 2
	UploadMediaTypeVideo = 3
	UploadMediaTypeFile  = 4
)

// ============ Typing 状态常量 ============

const (
	TypingStatusCancel = 0
	TypingStatusTyping = 1
)

// ============ BaseInfo ============

type BaseInfo struct {
	ChannelVersion string `json:"channel_version"`
}

// ============ GetUpdates 请求与响应 ============

type GetUpdatesReq struct {
	BaseInfo     BaseInfo `json:"base_info"`
	GetUpdatesBuf string   `json:"get_updates_buf"`
}

type GetUpdatesResp struct {
	Ret                   int            `json:"ret"`
	Errcode               int            `json:"errcode"`
	Errmsg                string         `json:"errmsg"`
	Msgs                  []WeixinMessage `json:"msgs"`
	GetUpdatesBuf         string         `json:"get_updates_buf"`
	LongpollingTimeoutMs  int            `json:"longpolling_timeout_ms"`
}

// ============ SendMessage 请求与响应 ============

type SendMessageReq struct {
	BaseInfo BaseInfo    `json:"base_info"`
	Msg      WeixinMessage `json:"msg"`
}

type SendMessageResp struct {
	Ret     int    `json:"ret"`
	Errcode int    `json:"errcode"`
	Errmsg  string `json:"errmsg"`
}

// ============ GetUploadUrl 请求与响应 ============

type GetUploadUrlReq struct {
	BaseInfo   BaseInfo `json:"base_info"`
	Filekey    string   `json:"filekey"`
	MediaType  int      `json:"media_type"`
	ToUserID   string   `json:"to_user_id"`
	Rawsize    int64    `json:"rawsize"`
	RawfileMD5 string   `json:"rawfile_md5"`
	Filesize   int64    `json:"filesize"`
	NoNeedThumb bool    `json:"no_need_thumb"`
	Aeskey     string   `json:"aeskey"`
}

type GetUploadUrlResp struct {
	Ret           int    `json:"ret"`
	Errcode        int    `json:"errcode"`
	Errmsg         string `json:"errmsg"`
	UploadParam    string `json:"upload_param"`
	UploadFullURL  string `json:"upload_full_url"`
}

// ============ GetConfig 请求与响应 ============

type GetConfigReq struct {
	BaseInfo     BaseInfo `json:"base_info"`
	IlinkUserID   string   `json:"ilink_user_id"`
	ContextToken  string   `json:"context_token"`
}

type GetConfigResp struct {
	Ret          int    `json:"ret"`
	Errcode      int    `json:"errcode"`
	Errmsg       string `json:"errmsg"`
	TypingTicket  string `json:"typing_ticket"`
}

// ============ SendTyping 请求与响应 ============

type SendTypingReq struct {
	BaseInfo     BaseInfo `json:"base_info"`
	IlinkUserID  string   `json:"ilink_user_id"`
	TypingTicket string   `json:"typing_ticket"`
	Status       int      `json:"status"`
}

type SendTypingResp struct {
	Ret     int    `json:"ret"`
	Errcode int    `json:"errcode"`
	Errmsg  string `json:"errmsg"`
}

// ============ QRCode 登录相关类型 ============

type QRCodeResponse struct {
	Qrcode        string `json:"qrcode"`
	QrcodeImgContent string `json:"qrcode_img_content"`
}

type StatusResponse struct {
	Status        string `json:"status"`
	BotToken      string `json:"bot_token"`
	IlinkUserID   string `json:"ilink_user_id"`
	IlinkBotID    string `json:"ilink_bot_id"`
	Baseurl       string `json:"baseurl"`
	RedirectHost  string `json:"redirect_host,omitempty"`
}

// ============ WeixinMessage 结构 ============

type WeixinMessage struct {
	ToUserID      string        `json:"to_user_id,omitempty"`
	FromUserID    string        `json:"from_user_id,omitempty"`
	ClientID      string        `json:"client_id,omitempty"`
	MessageType   int           `json:"message_type,omitempty"`
	MessageState  int           `json:"message_state,omitempty"`
	ItemList      []MessageItem `json:"item_list,omitempty"`
	ContextToken  string        `json:"context_token,omitempty"`
	SessionID     string        `json:"session_id,omitempty"`
}

// ============ MessageItem ============

type MessageItem struct {
	Type      int          `json:"type"`
	TextItem  *TextItem    `json:"text_item,omitempty"`
	VoiceItem *VoiceItem   `json:"voice_item,omitempty"`
	ImageItem *ImageItem   `json:"image_item,omitempty"`
	VideoItem *VideoItem   `json:"video_item,omitempty"`
	FileItem  *FileItem    `json:"file_item,omitempty"`
	RefMsg    *RefMessage  `json:"ref_msg,omitempty"`
}

// ============ TextItem ============

type TextItem struct {
	Text string `json:"text,omitempty"`
}

// ============ VoiceItem ============

type VoiceItem struct {
	Media *CDNMedia `json:"media,omitempty"`
	Text  string    `json:"text,omitempty"`
}

// ============ ImageItem ============

type ImageItem struct {
	Aeskey     string    `json:"aeskey,omitempty"`
	Media      *CDNMedia `json:"media,omitempty"`
	ThumbMedia *CDNMedia `json:"thumb_media,omitempty"`
	MidSize    int64     `json:"mid_size,omitempty"`
}

// ============ VideoItem ============

type VideoItem struct {
	Media     *CDNMedia `json:"media,omitempty"`
	VideoSize int64     `json:"video_size,omitempty"`
}

// ============ FileItem ============

type FileItem struct {
	Media    *CDNMedia `json:"media,omitempty"`
	FileName string    `json:"file_name,omitempty"`
	Len      string    `json:"len,omitempty"`
}

// ============ RefMessage ============

type RefMessage struct {
	MessageItem *MessageItem `json:"message_item,omitempty"`
}

// ============ CDNMedia ============

type CDNMedia struct {
	EncryptQueryParam string `json:"encrypt_query_param,omitempty"`
	FullURL           string `json:"full_url,omitempty"`
	AesKey            string `json:"aes_key,omitempty"`
	EncryptType       int    `json:"encrypt_type,omitempty"`
}